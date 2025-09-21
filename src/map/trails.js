import osmtogeojson from "osmtogeojson";

let trailLayerAdded = false;
let styleImageMissingListenerAdded = false;

export function addTrailLayer(map, trailGeoJSON, trailheadGeoJSON, showTrailsCheckbox) {
  if (!trailLayerAdded) {
    map.addSource("trails", { type: "geojson", data: trailGeoJSON });
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

    console.log("trailheadGeoJSON: ", trailheadGeoJSON);
    if (trailheadGeoJSON) {
      map.addSource("trailheads", { type: "geojson", data: trailheadGeoJSON });
      map.addLayer({
        id: "trailheads",
        type: "symbol",
        source: "trailheads", // Use the trailhead source
        layout: {
          "icon-image": "trailhead-icon",
          "icon-size": 1.2,
          "icon-allow-overlap": true,
          "text-offset": [0, 1.5],
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#000000"
        }
      });
    }

    trailLayerAdded = true;

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
    map.getSource("trails").setData(trailGeoJSON);
    if (trailheadGeoJSON && map.getSource("trailheads")) {
      map.getSource("trailheads").setData(trailheadGeoJSON);
    }
  }

  const visible = showTrailsCheckbox.checked;
  map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
  map.setLayoutProperty("trailsCenterLine", "visibility", visible ? "visible" : "none");
  if (map.getLayer("trailheads")) {
    map.setLayoutProperty("trailheads", "visibility", visible ? "visible" : "none");
  }
}

export async function fetchTrails(map, bounds, showTrailsCheckbox) {
  const [s, w, n, e] = bounds;
  
  // Separate queries for trails and trailheads
  const trailQuery = `
    [out:json][timeout:25];
    (
      way["highway"~"path|footway|cycleway|pedestrian|track|steps|bridleway"](${s},${w},${n},${e});
      relation["route"~"hiking|bicycle|foot"](${s},${w},${n},${e});
      relation["leisure"="park"](${s},${w},${n},${e});
    );
    out body; >; out skel qt;
  `;
  
  //TODO: This query needs to be updated. 
  const trailheadQuery = `
    [out:json][timeout:25];
    (
      node["information"="trailhead"]["informal"!="yes"]["parking"!="" ](${s},${w},${n},${e});
      node["amenity"="parking"]["access"!="private"]["hiking"="yes"](${s},${w},${n},${e});
    );
    out geom;
  `;
  
  // Fetch both
  const [trailRes, trailheadRes] = await Promise.all([
    fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(trailQuery)),
    fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(trailheadQuery))
  ]);
  
  const trailData = await trailRes.json();
  const trailheadData = await trailheadRes.json();

  console.log("Fetched trailhead data:", trailheadData);
  
  const trailGeoJSON = osmtogeojson(trailData);
  const trailheadGeoJSON = osmtogeojson(trailheadData);
  
  addTrailLayer(map, trailGeoJSON, trailheadGeoJSON, showTrailsCheckbox);
  return { trails: trailGeoJSON, trailheads: trailheadGeoJSON };
}