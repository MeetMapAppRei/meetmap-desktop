import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

export default function MapView({ events, selectedEvent, hoveredEvent, onEventClick, centerOn }) {
  const mapRef = useRef()
  const mapInstance = useRef()
  const markersRef = useRef({})

  useEffect(() => {
    if (!MAPBOX_TOKEN) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    mapInstance.current = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-98.5795, 39.8283],
      zoom: 4,
    })
    mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    mapInstance.current.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'bottom-right')
    return () => mapInstance.current?.remove()
  }, [])

  useEffect(() => {
    if (!mapInstance.current) return
    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.remove())
    markersRef.current = {}

    events.filter(e => e.lat && e.lng).forEach(event => {
      const color = TYPE_COLORS[event.type] || '#FF6B35'
      const el = document.createElement('div')
      el.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        background: ${color}; border: 2px solid #0A0A0A;
        cursor: pointer; transition: all 0.15s;
        box-shadow: 0 0 0 0 ${color}44;
      `
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.5)'
        el.style.boxShadow = `0 0 0 6px ${color}33`
      })
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)'
        el.style.boxShadow = `0 0 0 0 ${color}44`
      })
      el.addEventListener('click', () => onEventClick(event))

      const marker = new mapboxgl.Marker(el).setLngLat([event.lng, event.lat]).addTo(mapInstance.current)
      markersRef.current[event.id] = marker
    })
  }, [events])

  // Fly to selected/hovered
  useEffect(() => {
    const event = selectedEvent || hoveredEvent
    if (!event?.lat || !event?.lng || !mapInstance.current) return
    mapInstance.current.flyTo({ center: [event.lng, event.lat], zoom: 13, speed: 1.2 })
  }, [selectedEvent, hoveredEvent])

  useEffect(() => {
    if (!centerOn || !mapInstance.current) return
    mapInstance.current.flyTo({ center: [centerOn.lng, centerOn.lat], zoom: 13, speed: 1.2 })
  }, [centerOn])

  if (!MAPBOX_TOKEN) return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, color: '#FF6B35', marginBottom: 8 }}>MAP SETUP NEEDED</div>
        <div style={{ color: '#555', fontSize: 14 }}>Add VITE_MAPBOX_TOKEN to your .env file</div>
      </div>
    </div>
  )

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
