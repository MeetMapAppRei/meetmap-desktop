import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function MenuToggle({ label, active, onClick, isLight, panelBorder }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: active ? (isLight ? "#FFF3ED" : "#20140F") : "transparent",
        border: "none",
        padding: "10px 14px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: isLight ? "#222" : "#E8E8E8",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 16, color: active ? "#FF6B35" : panelBorder }}>
        {active ? "✓" : "○"}
      </span>
      {label}
    </button>
  );
}

export default function HeaderOptionsMenu({
  isLight,
  onToggleTheme,
  alertsEnabled,
  onAlertsClick,
  showPast,
  onTogglePast,
  showSavedOnly,
  onToggleSavedOnly,
  savedCount,
  showCanceled,
  onToggleCanceled,
  canAccessImports,
  pendingImportsCount = 0,
  onOpenImports,
  onOpenAutoImports,
  onOpenModeration,
  topBtnBg,
  topBtnBorder,
  topBtnColor,
  navBtnHeight,
  navBtnPaddingX,
  navBtnBorderRadius,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  const hasActiveFilters = showPast || showSavedOnly || showCanceled;

  const updateMenuPosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      const menuEl = document.getElementById("header-options-menu-panel");
      if (menuEl?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onLayoutChange = () => updateMenuPosition();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open]);

  const triggerStyle = {
    background: topBtnBg,
    border: `1px solid ${hasActiveFilters ? "#FF6B35" : topBtnBorder}`,
    color: hasActiveFilters ? (isLight ? "#D1491A" : "#FF8A5C") : topBtnColor,
    borderRadius: navBtnBorderRadius,
    padding: `0 ${navBtnPaddingX}px`,
    height: navBtnHeight,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  const menuItemStyle = {
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "10px 14px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    color: isLight ? "#222" : "#E8E8E8",
    cursor: "pointer",
  };

  const panelBg = isLight ? "#FFFFFF" : "#141414";
  const panelBorder = isLight ? "#E5E5E5" : "#2A2A2A";
  const sectionLabelStyle = {
    padding: "8px 14px 4px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: isLight ? "#888" : "#666",
  };

  const menuPanel = open && menuPos && (
    <div
      id="header-options-menu-panel"
      role="menu"
      style={{
        position: "fixed",
        top: menuPos.top,
        right: menuPos.right,
        minWidth: 220,
        background: panelBg,
        border: `1px solid ${panelBorder}`,
        borderRadius: 10,
        boxShadow: isLight
          ? "0 8px 24px rgba(0,0,0,0.12)"
          : "0 8px 24px rgba(0,0,0,0.45)",
        zIndex: 10000,
        overflow: "hidden",
        paddingBottom: 4,
      }}
    >
      <button
        type="button"
        role="menuitem"
        style={menuItemStyle}
        onClick={() => {
          onToggleTheme();
          setOpen(false);
        }}
      >
        {isLight ? "Switch to dark mode" : "Switch to light mode"}
      </button>
      <div style={{ height: 1, background: panelBorder, margin: "4px 0" }} />
      <button
        type="button"
        role="menuitem"
        style={menuItemStyle}
        onClick={async () => {
          setOpen(false);
          await onAlertsClick();
        }}
      >
        {alertsEnabled ? "Alert settings" : "Enable alerts"}
      </button>

      <div
        style={{ height: 1, background: panelBorder, margin: "6px 0 4px" }}
      />
      <div style={sectionLabelStyle}>View</div>
      <MenuToggle
        label="Past events"
        active={showPast}
        onClick={onTogglePast}
        isLight={isLight}
        panelBorder={panelBorder}
      />
      <MenuToggle
        label={
          showSavedOnly && savedCount > 0
            ? `Saved only (${savedCount})`
            : "Saved only"
        }
        active={showSavedOnly}
        onClick={onToggleSavedOnly}
        isLight={isLight}
        panelBorder={panelBorder}
      />
      <MenuToggle
        label="Show canceled"
        active={showCanceled}
        onClick={onToggleCanceled}
        isLight={isLight}
        panelBorder={panelBorder}
      />

      {canAccessImports && (
        <>
          <div
            style={{ height: 1, background: panelBorder, margin: "6px 0 4px" }}
          />
          <div style={sectionLabelStyle}>Admin</div>
          <button
            type="button"
            role="menuitem"
            style={menuItemStyle}
            onClick={() => {
              setOpen(false);
              onOpenImports?.();
            }}
          >
            Flyer imports
            {pendingImportsCount > 0 ? ` (${pendingImportsCount} pending)` : ""}
          </button>
          <button
            type="button"
            role="menuitem"
            style={menuItemStyle}
            onClick={() => {
              setOpen(false);
              onOpenAutoImports?.();
            }}
          >
            Auto import review
          </button>
          <button
            type="button"
            role="menuitem"
            style={menuItemStyle}
            onClick={() => {
              setOpen(false);
              onOpenModeration?.();
            }}
          >
            Moderation queue
          </button>
        </>
      )}
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={triggerStyle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Options ▾
      </button>
      {menuPanel && createPortal(menuPanel, document.body)}
    </div>
  );
}
