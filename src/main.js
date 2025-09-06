// 

import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { geojsonToGpxCustom } from "./utils/geojsonToGpx.js";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// init map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/outdoors-v12",
  center: [-98.5795, 39.8283],
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

// buttons
const panBtn = document.getElementById("panMode");
const drawBtn = document.getElementById("drawMode");
const exportBtn = document.getElementById("export");

function setActive(button) {
  [panBtn, drawBtn].forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

panBtn.onclick = () => {
  mode = "pan";
  map.dragPan.enable();
  Draw.changeMode("simple_select");
  setActive(panBtn);
};

drawBtn.onclick = () => {
  mode = "draw";
  map.dragPan.disable();
  Draw.changeMode("draw_line_string");
  setActive(drawBtn);
};

// stay in draw mode
map.on("draw.create", () => {
  if (mode === "draw") {
    Draw.changeMode("draw_line_string");
  }
});

const freeDrawBtn = document.getElementById("freeDrawMode");

let freeDrawing = false;
let tempCoords = [];
const SPACING_METERS = 25 * 0.3048; // 25ft in meters (~7.62 meters)

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

freeDrawBtn.onclick = () => {
  mode = "free";
  freeDrawing = false;
  map.dragPan.disable();
  setActive(freeDrawBtn);
};

// start drawing on mousedown
map.on("mousedown", (e) => {
  if (mode !== "free") return;
  freeDrawing = true;
  tempCoords = [[e.lngLat.lng, e.lngLat.lat]];
});

// add points as mouse moves, but only store in tempCoords
map.on("mousemove", (e) => {
  if (!freeDrawing || !tempCoords.length) return;
  const last = tempCoords[tempCoords.length - 1];
  const curr = [e.lngLat.lng, e.lngLat.lat];
  const dist = haversine(last, curr);
  if (dist >= SPACING_METERS) {
    tempCoords.push(curr);
  }
});

// on mouseup, add a single LineString to Draw
map.on("mouseup", (e) => {
  if (mode === "free" && freeDrawing && tempCoords.length > 1) {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: tempCoords },
      properties: {},
    };
    Draw.add(line);
  }
  if (mode === "free") {
    freeDrawing = false;
    tempCoords = [];
  }
});

// export GPX
exportBtn.onclick = () => {
  const data = Draw.getAll();
  if (data.features.length === 0) {
    alert("Draw a route first!");
    return;
  }

  const gpx = geojsonToGpxCustom(data, 20); // densify with 20 points per segment
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "route.gpx";
  a.click();
  URL.revokeObjectURL(url);
};

// set default mode
setActive(panBtn);