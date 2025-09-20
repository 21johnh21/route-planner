export function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function snapToTrail(lngLat, geojson, thresholdMeters = 20, snappingEnabled = true) {
  if (!snappingEnabled || !geojson) return [lngLat.lng, lngLat.lat];
  let nearest = null, minDist = Infinity;
  geojson.features.forEach(feature => {
    if (feature.geometry.type === "LineString") {
      feature.geometry.coordinates.forEach(([lon, lat]) => {
        const dist = haversine([lon, lat], [lngLat.lng, lngLat.lat]);
        if (dist < minDist && dist <= thresholdMeters) {
          minDist = dist;
          nearest = [lon, lat];
        }
      });
    }
  });
  return nearest || [lngLat.lng, lngLat.lat];
}