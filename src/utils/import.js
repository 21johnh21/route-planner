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

// Load GPX file from file input and add to map
export function importGPX(file, map, sourceId = "gpx-import") {
  const reader = new FileReader();

  reader.onload = (e) => {
    const gpxText = e.target.result;
    const geojson = parseGPX(gpxText);
    if (!geojson) return;

    // Add or update GeoJSON source
    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geojson);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: geojson,
      });

      map.addLayer({
        id: `${sourceId}-line`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#ff0000",
          "line-width": 3,
        },
      });
    }

    // Fit map to imported trail
    const bounds = geojson.features.reduce(
      (b, f) => b.extend(f.geometry.coordinates),
      new mapboxgl.LngLatBounds(
        geojson.features[0].geometry.coordinates[0],
        geojson.features[0].geometry.coordinates[0]
      )
    );
    map.fitBounds(bounds, { padding: 40 });
  };

  reader.readAsText(file);
}