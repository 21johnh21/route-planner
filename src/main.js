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