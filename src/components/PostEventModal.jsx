import { useState, useRef, useEffect } from "react";
import { createEvent, uploadEventPhoto } from "../lib/supabase";
import { geocodeAddress } from "../lib/geocode";
import { buildEventLocationQuery } from "../lib/eventLocation";

function userMessageForFlyerScanError(message) {
  const m = String(message || "").trim();
  if (!m) return "";
  if (
    /^model\s*:/i.test(m) ||
    /invalid model identifier|not a valid model|model_not_found|does not exist/i.test(
      m,
    )
  ) {
    return "Flyer import is temporarily unavailable. Please try again later or fill in the form manually.";
  }
  return m;
}

async function extractFlyerInfo(imageBase64, mediaType = "image/jpeg") {
  const response = await fetch("/api/extract-flyer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64,
      mediaType,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      response.statusText ||
      `Request failed (${response.status})`;
    throw new Error(userMessageForFlyerScanError(err) || err);
  }
  if (!data?.extracted) throw new Error("No extracted data returned");
  return data.extracted;
}

const inp = {
  width: "100%",
  background: "#141414",
  border: "1px solid #1E1E1E",
  borderRadius: 8,
  padding: "10px 13px",
  color: "#F0F0F0",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  outline: "none",
  marginBottom: 14,
  colorScheme: "dark",
};
const lbl = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 11,
  color: "#555",
  letterSpacing: 1,
  display: "block",
  marginBottom: 5,
  textTransform: "uppercase",
};

export default function PostEventModal({ user, onClose, onPosted }) {
  const fileRef = useRef();
  const flyerRef = useRef();
  const submitGuardRef = useRef(false);
  const [form, setForm] = useState({
    title: "",
    type: "meet",
    date: "",
    time: "",
    location: "",
    city: "",
    address: "",
    description: "",
    tags: "",
    host: "",
  });
  const [coords, setCoords] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [flyerSuccess, setFlyerSuccess] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [addressStatus, setAddressStatus] = useState("");
  const [error, setError] = useState("");
  const [isNarrowModal, setIsNarrowModal] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 720px)").matches,
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsNarrowModal(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const handleFlyerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    setError("");
    setFlyerSuccess(false);
    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(
          "That flyer file is too large for AI extraction. Try a smaller/cropped image (under ~8MB).",
        );
      }

      const mediaType = file.type || "image/jpeg";
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const info = await extractFlyerInfo(base64, mediaType);
      // Treat flyer image as the event photo by default.
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setForm((prev) => ({
        ...prev,
        title: info.title || prev.title,
        type: info.type || prev.type,
        date: info.date || prev.date,
        time: info.time || prev.time,
        location: info.location || prev.location,
        address: info.address || prev.address,
        city: info.city || prev.city,
        host: info.host || prev.host,
        description: info.description || prev.description,
        tags: info.tags || prev.tags,
      }));
      setFlyerSuccess(true);
      if (info.address || info.location || info.city) {
        const result = await geocodeAddress(
          buildEventLocationQuery({
            address: info.address || "",
            location: info.location || "",
            city: info.city || "",
          }),
        ).catch(() => null);
        if (result) {
          setCoords(result);
          setAddressStatus("found");
        }
      }
    } catch (e) {
      setError(
        e?.message ||
          "Could not read flyer. Try a clearer image or fill in manually.",
      );
    } finally {
      setScanning(false);
    }
  };

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return;
    setGeocoding(true);
    setAddressStatus("");
    setCoords(null);
    const result = await geocodeAddress(
      buildEventLocationQuery({
        address: form.address,
        location: form.location,
        city: form.city,
      }),
    ).catch(() => null);
    setCoords(result);
    setAddressStatus(result ? "found" : "notfound");
    setGeocoding(false);
  };

  const handleSubmit = async () => {
    const required = [
      { key: "title", label: "Event Name" },
      { key: "date", label: "Date" },
      { key: "city", label: "City, State" },
    ];
    const missing = required.filter((f) => !String(form[f.key] || "").trim());
    if (missing.length > 0) {
      setError(`Please complete: ${missing.map((m) => m.label).join(", ")}.`);
      return;
    }
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setError("");
    setLoading(true);
    try {
      let finalCoords = coords;
      if (form.address.trim()) {
        const geocoded = await geocodeAddress(
          buildEventLocationQuery({
            address: form.address,
            location: form.location,
            city: form.city,
          }),
        ).catch(() => null);
        if (geocoded) finalCoords = geocoded;
      }
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time,
        location: form.location,
        city: form.city,
        address: form.address,
        description: form.description,
        tags,
        host: form.host,
        lat: finalCoords?.lat || null,
        lng: finalCoords?.lng || null,
        user_id: user.id,
      };
      const created = await createEvent(payload, user.id);
      if (photo) {
        const url = await uploadEventPhoto(photo, created.id);
        const { supabase } = await import("../lib/supabase");
        await supabase
          .from("events")
          .update({ photo_url: url })
          .eq("id", created.id);
        created.photo_url = url;
      }
      onPosted(created);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isNarrowModal ? 12 : 24,
      }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: "100%",
          maxWidth: isNarrowModal ? "calc(100vw - 24px)" : 640,
          background: "#0F0F0F",
          borderRadius: 16,
          border: "1px solid #1A1A1A",
          overflow: "hidden",
          maxHeight: isNarrowModal ? "calc(100dvh - 24px)" : "90vh",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div style={{ padding: isNarrowModal ? "20px 18px 24px" : "24px 28px 32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue'",
                fontSize: 28,
                letterSpacing: 2,
                color: "#FF6B35",
              }}
            >
              POST A MEET
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                fontSize: 24,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* FLYER IMPORT BUTTON */}
          <div
            onClick={() => !scanning && flyerRef.current.click()}
            style={{
              border: scanning
                ? "2px solid #FF6B35"
                : flyerSuccess
                  ? "2px solid #7CFF6B44"
                  : "2px dashed #FF6B3555",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 20,
              cursor: scanning ? "default" : "pointer",
              background: flyerSuccess ? "#0A1A0A" : "#0F0F0F",
              display: "flex",
              alignItems: "center",
              gap: 14,
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 30 }}>
              {scanning ? "⏳" : flyerSuccess ? "✅" : "📸"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Bebas Neue'",
                  fontSize: 18,
                  letterSpacing: 1.5,
                  color: flyerSuccess ? "#7CFF6B" : "#FF6B35",
                  overflowWrap: "anywhere",
                }}
              >
                {scanning
                  ? "READING FLYER..."
                  : flyerSuccess
                    ? "FLYER IMPORTED!"
                    : "IMPORT FROM FLYER"}
              </div>
              <div
                style={{
                  fontFamily: "'DM Sans'",
                  fontSize: 12,
                  color: "#555",
                  marginTop: 2,
                  overflowWrap: "anywhere",
                }}
              >
                {scanning
                  ? "AI is extracting event details..."
                  : flyerSuccess
                    ? "Review the details below and edit if needed"
                    : "Upload a flyer image and AI will fill in all the details automatically"}
              </div>
            </div>
            {scanning && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  border: "2px solid #FF6B35",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
          <input
            ref={flyerRef}
            type="file"
            accept="image/*"
            onChange={handleFlyerUpload}
            style={{ display: "none" }}
          />

          {error && (
            <div
              style={{
                background: "#1A0A0A",
                border: "1px solid #FF353544",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
                color: "#FF6060",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Two column layout */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrowModal ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
              gap: isNarrowModal ? 0 : "0 24px",
            }}
          >
            <div>
              <label style={lbl}>Event Photo</label>
              <div
                onClick={() => fileRef.current.click()}
                style={{
                  border: "2px dashed #1E1E1E",
                  borderRadius: 10,
                  marginBottom: 14,
                  height: photoPreview ? 160 : 80,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "#111",
                }}
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24 }}>📸</div>
                    <div style={{ fontSize: 11, color: "#444" }}>
                      Click to add photo
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setPhoto(f);
                    setPhotoPreview(URL.createObjectURL(f));
                  }
                }}
                style={{ display: "none" }}
              />

              <label style={lbl}>Event Type</label>
              <select
                style={{ ...inp, appearance: "none", minWidth: 0 }}
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="meet">Meet</option>
                <option value="car show">Car Show</option>
                <option value="track day">Track Day</option>
                <option value="cruise">Cruise</option>
              </select>

              <label style={lbl}>Event Name *</label>
              <input
                style={{ ...inp, minWidth: 0 }}
                placeholder="Sunday Funday Car Meet"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />

              <label style={lbl}>Hosted By</label>
              <input
                style={{ ...inp, minWidth: 0 }}
                placeholder="Your crew or org"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
              />

              <label style={lbl}>Tags (comma separated)</label>
              <input
                style={{ ...inp, minWidth: 0 }}
                placeholder="JDM, Stance, All Welcome"
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
              />
            </div>

            <div>
              <label style={lbl}>Street Address (for map pin)</label>
              <input
                style={{
                  ...inp,
                  marginBottom: 4,
                  minWidth: 0,
                  borderColor:
                    addressStatus === "found" ? "#FF6B3555" : "#1E1E1E",
                }}
                placeholder="123 Main St, City, ST"
                value={form.address}
                onChange={(e) => {
                  set("address", e.target.value);
                  setAddressStatus("");
                  setCoords(null);
                }}
                onBlur={handleAddressBlur}
              />
              <div
                style={{
                  fontFamily: "'DM Sans'",
                  fontSize: 11,
                  height: 18,
                  marginBottom: 10,
                }}
              >
                {geocoding && (
                  <span style={{ color: "#444" }}>🔍 Looking up...</span>
                )}
                {!geocoding && addressStatus === "found" && (
                  <span style={{ color: "#FF6B35" }}>✓ Address found</span>
                )}
                {!geocoding && addressStatus === "notfound" && (
                  <span style={{ color: "#FF9944" }}>
                    ⚠️ Not found — try adding city/state
                  </span>
                )}
              </div>

              <label style={lbl}>Venue / Spot Name (optional)</label>
              <input
                style={{ ...inp, minWidth: 0 }}
                placeholder="AutoZone Parking, Walmart Lot"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />

              <label style={lbl}>City, State *</label>
              <input
                style={{ ...inp, minWidth: 0 }}
                placeholder="Riverside, CA"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrowModal ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: isNarrowModal ? 0 : 10,
                }}
              >
                <div>
                  <label style={lbl}>Date *</label>
                  <input
                    style={{ ...inp, minWidth: 0 }}
                    type="date"
                    value={form.date}
                    onChange={(e) => set("date", e.target.value)}
                  />
                </div>
                <div>
                  <label style={lbl}>Time</label>
                  <input
                    style={{ ...inp, minWidth: 0 }}
                    type="time"
                    value={form.time}
                    onChange={(e) => set("time", e.target.value)}
                  />
                </div>
              </div>

              <label style={lbl}>Details</label>
              <textarea
                placeholder="What's the vibe?"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={4}
                style={{ ...inp, resize: "none", minWidth: 0 }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || scanning}
            style={{
              width: "100%",
              background: loading || scanning ? "#222" : "#FF6B35",
              color: loading || scanning ? "#555" : "#0A0A0A",
              border: "none",
              borderRadius: 10,
              padding: 14,
              fontFamily: "'Bebas Neue'",
              fontSize: 20,
              letterSpacing: 2,
              cursor: loading || scanning ? "default" : "pointer",
              marginTop: 8,
            }}
          >
            {loading
              ? "POSTING..."
              : scanning
                ? "READING FLYER..."
                : "DROP THE PIN 📍"}
          </button>
        </div>
      </div>
    </div>
  );
}
