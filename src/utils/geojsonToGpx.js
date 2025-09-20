// src/utils/geojsonToGpx.js

const FEET_TO_METERS = 0.3048;

/**
 * Calculate distance between two coordinates (lon/lat) in meters using Haversine formula
 */
function haversineDistance([lon1, lat1], [lon2, lat2]) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Linearly interpolate between two coordinates
 */
function interpolatePoints(start, end, segments) {
  const points = [];
  for (let i = 1; i <= segments; i++) {
    const lon = start[0] + (i / (segments + 1)) * (end[0] - start[0]);
    const lat = start[1] + (i / (segments + 1)) * (end[1] - start[1]);
    points.push([lon, lat]);
  }
  return points;
}

/**
 * Convert GeoJSON FeatureCollection (from Mapbox Draw) into GPX string
 * Adds interpolated points every ~50ft to ensure visibility in apps like Google Earth
 */
export function geojsonToGpxCustom(geojson, spacingFeet = 50) {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Route Planner" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`;

  gpx += `<metadata><name>Route Export</name></metadata>\n`;

  let currentTime = new Date();

  geojson.features.forEach((feature, i) => {
    if (feature.geometry.type === "LineString") {
      gpx += `<trk><name>Route ${i + 1}</name><trkseg>\n`;

      const coords = feature.geometry.coordinates;
      for (let j = 0; j < coords.length - 1; j++) {
        const [lon1, lat1] = coords[j];
        const [lon2, lat2] = coords[j + 1];

        // always add the starting point
        gpx += `  <trkpt lat="${lat1}" lon="${lon1}"><ele>0</ele><time>${currentTime.toISOString()}</time></trkpt>\n`;
        currentTime = new Date(currentTime.getTime() + 1000);

        // compute how many extra points needed
        const distMeters = haversineDistance([lon1, lat1], [lon2, lat2]);
        const segments = Math.floor(distMeters / (spacingFeet * FEET_TO_METERS));

        // insert extra points
        const extraPoints = interpolatePoints([lon1, lat1], [lon2, lat2], segments);
        extraPoints.forEach(([lon, lat]) => {
          gpx += `  <trkpt lat="${lat}" lon="${lon}"><ele>0</ele><time>${currentTime.toISOString()}</time></trkpt>\n`;
          currentTime = new Date(currentTime.getTime() + 1000);
        });
      }

      // add the final point
      const [lonLast, latLast] = coords[coords.length - 1];
      gpx += `  <trkpt lat="${latLast}" lon="${lonLast}"><ele>0</ele><time>${currentTime.toISOString()}</time></trkpt>\n`;
      currentTime = new Date(currentTime.getTime() + 1000);

      gpx += `</trkseg></trk>\n`;
    }
  });

  gpx += `</gpx>`;
  return gpx;
}

export function geojsonToGpx(geojson, spacingFeet = 50) {
  return geojsonToGpxCustom(geojson, spacingFeet);
}