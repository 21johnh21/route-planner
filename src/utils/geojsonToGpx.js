// src/utils/geojsonToGpx.js

/**
 * Linearly interpolate between two coordinates
 * @param {[number, number]} start [lon, lat]
 * @param {[number, number]} end [lon, lat]
 * @param {number} segments number of points to insert between
 * @returns {[number, number][]}
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
 * Adds interpolation points to ensure the track is visible in apps like Google Earth
 *
 * @param {GeoJSON.FeatureCollection} geojson
 * @param {number} densify number of extra points to add between each pair
 * @returns {string} GPX XML string
 */
export function geojsonToGpxCustom(geojson, densify = 10) {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Route Planner">\n`;

  geojson.features.forEach((feature, i) => {
    if (feature.geometry.type === "LineString") {
      gpx += `<trk><name>Route ${i + 1}</name><trkseg>\n`;

      const coords = feature.geometry.coordinates;
      for (let j = 0; j < coords.length - 1; j++) {
        const [lon1, lat1] = coords[j];
        const [lon2, lat2] = coords[j + 1];

        // add start point
        gpx += `  <trkpt lat="${lat1}" lon="${lon1}"/>\n`;

        // add interpolated points
        const extraPoints = interpolatePoints([lon1, lat1], [lon2, lat2], densify);
        extraPoints.forEach(([lon, lat]) => {
          gpx += `  <trkpt lat="${lat}" lon="${lon}"/>\n`;
        });
      }

      // add final point
      const [lonLast, latLast] = coords[coords.length - 1];
      gpx += `  <trkpt lat="${latLast}" lon="${lonLast}"/>\n`;

      gpx += `</trkseg></trk>\n`;
    }
  });

  gpx += `</gpx>`;
  return gpx;
}