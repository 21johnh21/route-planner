import osmtogeojson from "osmtogeojson";

let trailLayerAdded = false;
let styleImageMissingListenerAdded = false;

export function addTrailLayer(map, geojson, showTrailsCheckbox) {
  if (!trailLayerAdded) {
    map.addSource("trails", { type: "geojson", data: geojson });
    map.addLayer({
      id: "trailsLayer",
      type: "line",
      source: "trails",
      paint: { 
        "line-color": "#808080", 
        "line-width": 4,
        "line-dasharray": [3, 4],
        "line-opacity": 0.7
      },
    });
    map.addLayer({
      id: "trailsCenterLine",
      type: "line",
      source: "trails",
      paint: {
        "line-color": "#FFFF00",
        "line-width": 2,
        "line-opacity": 0.7,
        "line-dasharray": [1, 0]
      },
    });
    trailLayerAdded = true;
    map.addLayer({
      id: "trailheads",
      type: "symbol",
      source: "trails",
      layout: {
        "icon-image": "trailhead-icon", // Custom icon, loaded dynamically if missing
        "icon-size": 1.2,
        "icon-allow-overlap": true,
        "text-offset": [0, 1.5],
        "text-anchor": "top"
      },
      paint: {
        "text-color": "#000000"
      }
    });

    if (map && typeof map.on === "function" && !styleImageMissingListenerAdded) {
      map.on("styleimagemissing", function(e) {
        if (e.id === "trailhead-icon") {
          // Create a small solid circle icon (e.g., 32x32 px, black circle)
          const size = 32;
          const radius = 12;
          const data = new Uint8ClampedArray(size * size * 4);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const dx = x - size / 2 + 0.5;
              const dy = y - size / 2 + 0.5;
              if (dx * dx + dy * dy <= radius * radius) {
                // Black circle with full opacity
                const offset = 4 * (y * size + x);
                data[offset] = 0;     // R
                data[offset + 1] = 0; // G
                data[offset + 2] = 0; // B
                data[offset + 3] = 255; // A
              }
            }
          }
          map.addImage(
            "trailhead-icon",
            { width: size, height: size, data: data },
            { pixelRatio: 2 }
          );
        }
      });
      styleImageMissingListenerAdded = true;
    }
    
  } else {
    map.getSource("trails").setData(geojson);
  }

  const visible = showTrailsCheckbox.checked;
  map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
  map.setLayoutProperty("trailsCenterLine", "visibility", visible ? "visible" : "none");
}

export async function fetchTrails(map, bounds, showTrailsCheckbox) {
  const [s, w, n, e] = bounds;
  const query = `
    [out:json][timeout:25];
    (
        way["highway"~"path|footway|cycleway|pedestrian|track|steps|bridleway"](${s},${w},${n},${e});
        relation["route"~"hiking|bicycle|foot"](${s},${w},${n},${e});
        relation["leisure"="park"](${s},${w},${n},${e});
        node["information"="trailhead"]["informal"!="yes"](${s},${w},${n},${e});
    );
    out body; >; out skel qt;
  `;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  const res = await fetch(url);
  const data = await res.json();
  const trailGeoJSON = osmtogeojson(data);
  addTrailLayer(map, trailGeoJSON, showTrailsCheckbox);
  return trailGeoJSON;
}