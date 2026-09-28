import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
type Marker = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};
export function DemoMap({
  markers,
  kind,
}: {
  markers: Marker[];
  kind: 'Checkpoint' | 'Incident';
}) {
  const [enabled, setEnabled] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !element.current) return;
    const map = L.map(element.current).setView([-17.8253, 31.0335], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    for (const marker of markers) {
      const label = document.createElement('span');
      label.textContent = marker.label;
      L.circleMarker([marker.latitude, marker.longitude], {
        radius: 8,
        color: '#15566a',
        fillOpacity: 0.8,
      })
        .addTo(map)
        .bindPopup(label);
    }
    if (markers.length)
      map.fitBounds(
        L.latLngBounds(
          markers.map((marker) => [marker.latitude, marker.longitude]),
        ),
        { maxZoom: 14, padding: [30, 30] },
      );
    return () => {
      map.remove();
    };
  }, [enabled, markers]);
  return (
    <div>
      <p>
        {kind} locations are displayed on the map for the current results page.
        Basemap requires internet access.
      </p>
      {!enabled ? (
        <button onClick={() => setEnabled(true)}>
          View {kind.toLowerCase()} map
        </button>
      ) : (
        <>
          <button onClick={() => setEnabled(false)}>Hide map</button>
          <div
            ref={element}
            style={{ height: 360 }}
            aria-label={`Map of ${kind.toLowerCase()} locations`}
          />
        </>
      )}
    </div>
  );
}
