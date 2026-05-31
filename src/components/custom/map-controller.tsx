import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { LeafletMouseEvent } from "leaflet";

interface MapControllerProps {
  center: [number, number];
  onMapClick: (lat: number, lon: number) => void;
  disabled?: boolean;
}

export default function MapController({
  center,
  onMapClick,
  disabled = false,
}: MapControllerProps): null {
  const map = useMap();

  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, 14, { animate: true, duration: 0.75 });
    }
  }, [center, map]);

  useMapEvents({
    click(e: LeafletMouseEvent) {
      if (disabled) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}
