import osmtogeojson from "osmtogeojson";

let trailLayerAdded = false;

export function addTrailLayer(map, geojson, showTrailsCheckbox) {
  if (!trailLayerAdded) {
    map.addSource("trails", { type: "geojson", data: geojson });
    map.addLayer({
      id: "trailsLayer",
      type: "line",
      source: "trails",
      paint: { "line-color": "#00ff00", "line-width": 3 },
    });
    trailLayerAdded = true;
  } else {
    map.getSource("trails").setData(geojson);
  }

  const visible = showTrailsCheckbox.checked;
  map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
}

export async function fetchTrails(map, bounds, showTrailsCheckbox) {
  const [s, w, n, e] = bounds;
  const query = `
    [out:json][timeout:25];
    (
        way["highway"~"path|footway|cycleway|pedestrian|track|steps|bridleway"](${s},${w},${n},${e});
        relation["route"~"hiking|bicycle|foot"](${s},${w},${n},${e});
        relation["leisure"="park"](${s},${w},${n},${e});
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