// src/utils/import.js
import * as toGeoJSON from "@tmcw/togeojson";

// Parse GPX text into GeoJSON
export function parseGPX(gpxText) {
  try {
    const parser = new DOMParser();
    const gpxDom = parser.parseFromString(gpxText, "application/xml");
    return toGeoJSON.gpx(gpxDom);
  } catch (err) {
    console.error("Error parsing GPX:", err);
    return null;
  }
}

// Import GPX and save as Draw features instead of temp source
export function importGPX(file, map, Draw) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const gpxText = e.target.result;
    const geojson = parseGPX(gpxText);
    if (!geojson) return;

    // Convert GPX features into Draw-compatible features
    geojson.features.forEach((feature) => {
      if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
        try {
          const added = Draw.add(feature);
          console.log("Imported GPX trail added:", added);
        } catch (err) {
          console.error("Failed to add GPX feature to Draw:", err);
        }
      }
    });

    // Fit map to imported trail
    const coords = geojson.features.flatMap((f) => f.geometry.coordinates);
    if (coords.length) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 40 });
    }
  };

  reader.readAsText(file);
}