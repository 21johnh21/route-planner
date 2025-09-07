import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { geojsonToGpxCustom } from "./utils/geojsonToGpx.js";
import osmtogeojson from "osmtogeojson";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// default center (fallback if location not available)
const defaultCenter = [-98.5795, 39.8283]; // USA center

// init map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/outdoors-v12",
  center: defaultCenter,
  zoom: 3,
});

map.addControl(new mapboxgl.NavigationControl());

// init draw
const Draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: { trash: true },
});
map.addControl(Draw);

let mode = "pan";
map.dragPan.enable();

const panBtn = document.getElementById("panMode");
const drawBtn = document.getElementById("drawMode");
const freeDrawBtn = document.getElementById("freeDrawMode");
const exportBtn = document.getElementById("export");
const snapToggle = document.getElementById("snapToggle");
const showTrailsCheckbox = document.getElementById("showTrails");

function setActive(button) {
  [panBtn, drawBtn, freeDrawBtn].forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

panBtn.onclick = () => {
  mode = "pan";
  map.dragPan.enable();
  map.getCanvas().style.cursor = "grab";
  Draw.changeMode("simple_select");
  setActive(panBtn);
};

drawBtn.onclick = () => {
  mode = "draw";
  map.dragPan.disable();
  map.getCanvas().style.cursor = "crosshair";
  Draw.changeMode("draw_line_string");
  setActive(drawBtn);
};

freeDrawBtn.onclick = () => {
  mode = "free";
  map.dragPan.disable();
  map.getCanvas().style.cursor = "crosshair";
  Draw.changeMode("simple_select");
  setActive(freeDrawBtn);
};

// Geolocation
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userCoords = [position.coords.longitude, position.coords.latitude];
      map.setCenter(userCoords);
      map.setZoom(13);

      new mapboxgl.Marker({ color: "blue" })
        .setLngLat(userCoords)
        .setPopup(new mapboxgl.Popup().setText("You are here"))
        .addTo(map);
    },
    (error) => {
      console.warn("Geolocation error:", error.message);
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
} else {
  console.warn("Geolocation not supported by this browser");
}

// Free draw variables
let freeDrawing = false;
let tempCoords = [];
const SPACING_METERS = 25 * 0.3048; // 25ft in meters (~7.62 meters)

// Snapping
let snappingEnabled = snapToggle.checked;

// Trail data and layer state
let trailGeoJSON = null;
let trailLayerAdded = false;

// Utility: haversine distance in meters
function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Snap to nearest trail point within threshold (meters)
function snapToTrail(lngLat, geojson, thresholdMeters = 10) {
  if (!snappingEnabled || !geojson) return [lngLat.lng, lngLat.lat];

  let nearest = null;
  let minDist = Infinity;
  geojson.features.forEach((feature) => {
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

// Update temporary free draw line source data
function updateTempLine(coords) {
  const source = map.getSource("tempFreeDraw");
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
  });
}

// Add trail layer to map or update data
function addTrailLayer(geojson) {
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
  // Make sure trails are visible or hidden based on checkbox
  const visible = showTrailsCheckbox.checked;
  map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
}

// Fetch trails from Overpass API given bounding box [south, west, north, east]
async function fetchTrails(bounds) {
  const [s, w, n, e] = bounds;
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"path|footway"](${s},${w},${n},${e});
    );
    out body;
    >;
    out skel qt;
  `;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  try {
    const res = await fetch(url);
    const data = await res.json();
    trailGeoJSON = osmtogeojson(data);
    addTrailLayer(trailGeoJSON);
  } catch (error) {
    console.error("Failed to fetch trails:", error);
  }
}

// Initialize temporary free draw source and layer
map.on("load", () => {
  map.addSource("tempFreeDraw", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "tempFreeDrawLine",
    type: "line",
    source: "tempFreeDraw",
    paint: {
      "line-color": "#ff0000",
      "line-width": 3,
    },
  });

  // Fetch trails for initial view if zoom >= 12
  if (map.getZoom() >= 12) {
    const bounds = map.getBounds();
    fetchTrails([bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]);
  }

  // Set default mode to pan
  setActive(panBtn);
  map.getCanvas().style.cursor = "grab";
});

// Fetch trails when map moves if zoom >= 12, else hide trails
map.on("moveend", () => {
  if (map.getZoom() >= 12) {
    const bounds = map.getBounds();
    fetchTrails([bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]);
  } else {
    if (trailLayerAdded && map.getLayer("trailsLayer")) {
      map.setLayoutProperty("trailsLayer", "visibility", "none");
    }
  }
});

// Free draw handlers
map.on("mousedown", (e) => {
  if (mode !== "free") return;
  freeDrawing = true;
  tempCoords = [[e.lngLat.lng, e.lngLat.lat]];
  updateTempLine(tempCoords);
});

map.on("mousemove", (e) => {
  if (!freeDrawing || tempCoords.length === 0) return;
  const last = tempCoords[tempCoords.length - 1];
  const curr = [e.lngLat.lng, e.lngLat.lat];
  const dist = haversine(last, curr);
  if (dist >= SPACING_METERS) {
    tempCoords.push(curr);
    updateTempLine(tempCoords);
  }
});

map.on("mouseup", (e) => {
  if (mode === "free" && freeDrawing && tempCoords.length > 1) {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: tempCoords },
      properties: {},
    };
    Draw.add(line);
    updateTempLine([]);
  }
  if (mode === "free") {
    freeDrawing = false;
    tempCoords = [];
  }
});

// Snap toggle handler
snapToggle.onchange = (e) => {
  snappingEnabled = e.target.checked;
};

// Export GPX
exportBtn.onclick = () => {
  const data = Draw.getAll();
  if (data.features.length === 0) {
    alert("Draw a route first!");
    return;
  }

  const gpx = geojsonToGpxCustom(data, 20);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "route.gpx";
  a.click();
  URL.revokeObjectURL(url);
};

// Show/hide trails toggle
showTrailsCheckbox.onchange = (e) => {
  const visible = e.target.checked;
  if (trailLayerAdded && map.getLayer("trailsLayer")) {
    map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
  }
};