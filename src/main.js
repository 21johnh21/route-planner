// src/main.js
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { initMap } from "./map/initMap.js";
import { setupModes } from "./map/drawModes.js";
import { snapToTrail, haversine } from "./map/snapping.js";
import { fetchTrails } from "./map/trails.js";
import { exportGpx } from "./utils/export.js";
import { setupFreeDraw } from "./map/freeDraw.js";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ---------- Config / constants ----------
const DEFAULT_CENTER = [-98.5795, 39.8283]; // continental USA
const SPACING_METERS = 25 * 0.3048; // 25 ft -> meters (~7.62)
const SNAP_THRESHOLD_METERS = 20;

// ---------- Initialize map & controls ----------
const map = initMap(DEFAULT_CENTER);

// Add raster satellite layer source and layer
map.on("load", () => {
  if (!map.getSource("satellite-layer")) {
    map.addSource("satellite-layer", {
      type: "raster",
      url: "mapbox://mapbox.satellite",
      tileSize: 256,
    });
  }
  if (!map.getLayer("satellite-layer")) {
    map.addLayer({
      id: "satellite-layer",
      type: "raster",
      source: "satellite-layer",
      layout: { visibility: "none" },
    });
  }
});

// Add satellite toggle button control
class SatelliteToggleControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Toggle Satellite Layer";
    button.textContent = "Sat";
    button.style.fontWeight = "bold";
    button.style.fontSize = "12px";
    button.style.cursor = "pointer";
    this._container.appendChild(button);

    button.addEventListener("click", () => {
      const visibility = map.getLayoutProperty("satellite-layer", "visibility");
      if (visibility === "visible") {
        map.setLayoutProperty("satellite-layer", "visibility", "none");
      } else {
        map.setLayoutProperty("satellite-layer", "visibility", "visible");
      }
    });

    return this._container;
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}
map.addControl(new SatelliteToggleControl(), "top-right");

const Draw = new MapboxDraw({ displayControlsDefault: false });
map.addControl(Draw);

// ---------- DOM elements ----------
const panBtn = document.getElementById("panMode");
const drawBtn = document.getElementById("drawMode");
const freeDrawBtn = document.getElementById("freeDrawMode");
const exportBtn = document.getElementById("export");
const snapToggle = document.getElementById("snapToggle");
const showTrailsCheckbox = document.getElementById("showTrails");
const deleteBtn = document.getElementById("delete");

// ---------- Mode setup (uses drawModes module) ----------
// setupModes might return different small shapes depending on your implementation.
// be defensive: accept missing functions.
const modesApi = setupModes?.({ map, Draw, panBtn, drawBtn, freeDrawBtn }) || {};
const setModeModule = typeof modesApi.setMode === "function" ? modesApi.setMode : () => {};
const setActive = typeof modesApi.setActive === "function" ? modesApi.setActive : () => {};
const getMode = typeof modesApi.getMode === "function" ? modesApi.getMode : () => "pan";

let mode = "pan";
function setMode(newMode) {
  mode = newMode;
  map._mode = newMode; // expose current mode on map for freeDraw.js use
  try { setModeModule(newMode); } catch (err) { /* ignore if not implemented */ }
}

// wire up UI -> mode
if (panBtn) panBtn.addEventListener("click", () => setMode("pan"));
if (drawBtn) drawBtn.addEventListener("click", () => setMode("draw"));
if (freeDrawBtn) freeDrawBtn.addEventListener("click", () => setMode("free"));

// ---------- Delete all handler ----------
if (deleteBtn) {
  deleteBtn.addEventListener("click", () => {
    const all = Draw.getAll();
    if (!all || all.features.length === 0) {
      alert("No routes to delete!");
      return;
    }
    Draw.deleteAll();
  });
}

// ---------- Geolocation ----------
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      map.setCenter(coords);
      map.setZoom(13);
      new mapboxgl.Marker({ color: "blue" })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setText("You are here"))
        .addTo(map);
    },
    (err) => {
      console.warn("Geolocation error:", err.message);
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
} else {
  console.warn("Geolocation not supported by this browser");
}

// ---------- Free-draw state moved to freeDraw.js ----------
let trailGeoJSON = null;

// Update the on-map temporary line used while free-drawing is moved to freeDraw.js

// ---------- Map load: add temp source/layer + initial trails fetch ----------
map.on("load", () => {
  // temporary free-draw source + layer
  if (!map.getSource("tempFreeDraw")) {
    map.addSource("tempFreeDraw", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer("tempFreeDrawLine")) {
    map.addLayer({
      id: "tempFreeDrawLine",
      type: "line",
      source: "tempFreeDraw",
      paint: {
        "line-color": "#ff0000",
        "line-width": 3,
      },
    });
  }

  // initial trails fetch for current view if zoomed in
  if (map.getZoom() >= 12) {
    const b = map.getBounds();
    fetchTrails?.(map, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], showTrailsCheckbox)
      .then((g) => { if (g) trailGeoJSON = g; })
      .catch((e) => console.warn("fetchTrails failed:", e));
  }

  // default UI mode
  setActive(panBtn);
  map.getCanvas().style.cursor = "grab";

  // Setup free-draw handlers
  setupFreeDraw(map, Draw, trailGeoJSON, snapToggle, SPACING_METERS, SNAP_THRESHOLD_METERS);
});

// Fetch trails on moveend when zoom is high enough; otherwise hide trail layer
map.on("moveend", () => {
  if (map.getZoom() >= 12) {
    const b = map.getBounds();
    fetchTrails?.(map, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], showTrailsCheckbox)
      .then((g) => {
        if (g) {
          trailGeoJSON = g;
        }
      })
      .catch((e) => console.warn("fetchTrails failed:", e));
  } else {
    if (map.getLayer && map.getLayer("trailsLayer")) {
      map.setLayoutProperty("trailsLayer", "visibility", "none");
    }
  }
});

// ---------- UI handlers ----------
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportGpx?.(Draw, "route.gpx");
  });
}

// show/hide trails checkbox
if (showTrailsCheckbox) {
  showTrailsCheckbox.addEventListener("change", (e) => {
    const visible = !!e.target.checked;
    if (map.getLayer && map.getLayer("trailsLayer")) {
      map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
    }
    if (map.getLayer && map.getLayer("trailsCenterLine")) {
      map.setLayoutProperty("trailsCenterLine", "visibility", visible ? "visible" : "none");
    }
  });
}