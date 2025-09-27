// src/main.js
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { initMap } from "./map/initMap.js";
import { setupModes } from "./map/drawModes.js";
import { snapToTrail, haversine } from "./map/snapping.js";
import { fetchTrails } from "./map/trails.js";
import { exportGpx } from "./utils/export.js";
import { setupFreeDraw } from "./map/freeDraw.js";
import { setupUndo } from "./map/undo.js";
import SegmentMode from "./map/segmentMode.js";
import { initMapAtUser } from "./map/geolocation.js";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Function to show trailhead popup with feature properties
function showTrailheadPopup(feature, map) {
  if (!feature || !feature.geometry) return;

  let coords = feature.geometry.coordinates;

  // If coordinates is nested, flatten it
  if (Array.isArray(coords[0]) && typeof coords[0][0] === "number") {
    coords = coords[0];
  }

  // Validate
  if (!Array.isArray(coords) || coords.some(c => typeof c !== "number")) {
    console.warn("Invalid coordinates for trailhead feature:", feature);
    return;
  }

  const html = "<pre>" + JSON.stringify(feature.properties, null, 2) + "</pre>";
  new mapboxgl.Popup()
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
}

// ---------- Config / constants ----------
const DEFAULT_CENTER = [-98.5795, 39.8283]; // continental USA
const SPACING_METERS = 25 * 0.3048; // 25 ft -> meters (~7.62)
const SNAP_THRESHOLD_METERS = 20;

// ---------- Initialize map & controls ----------
const map = await initMapAtUser();

// Add satellite toggle button control
class SatelliteToggleControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Toggle Satellite Layer";
    // Set initial text based on current visibility
    const hasLayer = map.getLayer("satellite-layer");
    let visibility = "none";
    if (hasLayer) {
      visibility = map.getLayoutProperty("satellite-layer", "visibility");
    }
    button.textContent = visibility === "visible" ? "Map" : "Sat";
    button.style.fontWeight = "bold";
    button.style.fontSize = "12px";
    button.style.cursor = "pointer";
    this._container.appendChild(button);

    button.addEventListener("click", () => {
      if (!map.getLayer("satellite-layer")) {
        console.warn("Satellite layer not yet available");
        return;
      }
      const visibility = map.getLayoutProperty("satellite-layer", "visibility");
      if (visibility === "visible") {
        map.setLayoutProperty("satellite-layer", "visibility", "none");
        button.textContent = "Sat";
      } else {
        map.setLayoutProperty("satellite-layer", "visibility", "visible");
        button.textContent = "Map";
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

// Add center on user control
class CenterOnUserControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Center on User Location";
    button.textContent = "⦿";
    button.style.fontWeight = "bold";
    button.style.fontSize = "12px";
    button.style.cursor = "pointer";
    this._container.appendChild(button);

    button.addEventListener("click", () => {
      if (!navigator.geolocation) {
        console.warn("Geolocation not supported by this browser");
        return;
      }
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
    });

    return this._container;
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}
map.addControl(new CenterOnUserControl(), "top-right");

// Create Draw instance with SegmentMode
const Draw = new MapboxDraw({
  displayControlsDefault: false,
  modes: Object.assign({}, MapboxDraw.modes, { 
    segment: SegmentMode  // Use "segment" to match drawModes.js
  })
});
map.addControl(Draw);

// IMPORTANT: Set the Draw instance AFTER creating it
SegmentMode.setDrawInstance(Draw);

let trailGeoJSON = null;

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

  // Add temporary segment source + layer with a different color (blue)
  if (!map.getSource("tempSegment")) {
    map.addSource("tempSegment", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer("tempSegmentLine")) {
    map.addLayer({
      id: "tempSegmentLine",
      type: "line",
      source: "tempSegment",
      paint: {
        "line-color": "#0000ff",
        "line-width": 3,
      },
    });
  }

  // Setup undo functionality
  if (undoBtn) setupUndo(map, Draw, undoBtn);

  // initial trails fetch for current view if zoomed in
  if (map.getZoom() >= 12) {
    const b = map.getBounds();
    fetchTrails?.(map, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], showTrails)
      .then((g) => { if (g) trailGeoJSON = g; })
      .catch((e) => console.warn("fetchTrails failed:", e));
  }

  // default UI mode
  setActive(panBtn);
  map.getCanvas().style.cursor = "grab";

  // Setup free-draw handlers
  setupFreeDraw(map, Draw, trailGeoJSON, snapToggle, SPACING_METERS, SNAP_THRESHOLD_METERS);

    // Move all Mapbox Draw layers above satellite
  map.getStyle().layers.forEach(layer => {
    if (layer.id.startsWith("gl-draw-") || layer.id === "draw_line_string") {
      map.moveLayer(layer.id);
    }
  });

  // Move temp layers above satellite
  ["tempFreeDrawLine", "tempSegmentLine"].forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  });
});

// Fetch trails on moveend when zoom is high enough; otherwise hide trail layer
map.on("moveend", () => {
  if (map.getZoom() >= 12) {
    const b = map.getBounds();
    fetchTrails?.(map, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], showTrails)
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

// ---------- DOM elements ----------
const panBtn = document.getElementById("panMode");
const drawBtn = document.getElementById("drawMode");
const freeDrawBtn = document.getElementById("freeDrawMode");
const segmentModeBtn = document.getElementById("segmentMode");
const exportBtn = document.getElementById("export");
const showTrailsBtn = document.getElementById("showTrailsBtn");
const snapToggleBtn = document.getElementById("snapToggleBtn");
const deleteBtn = document.getElementById("delete");
const undoBtn = document.getElementById("undo");

// ---------- State booleans for buttons ----------
let showTrails = true;
let snapToggle = true;

// Initialize buttons active state
if (showTrailsBtn) {
  showTrailsBtn.classList.add("active");
}
if (snapToggleBtn) {
  snapToggleBtn.classList.add("active");
}

// Wire up showTrailsBtn toggle behavior
if (showTrailsBtn) {
  showTrailsBtn.addEventListener("click", () => {
    showTrails = !showTrails;
    if (showTrails) {
      showTrailsBtn.classList.add("active");
    } else {
      showTrailsBtn.classList.remove("active");
    }
    // Update trail layers visibility immediately
    if (map.getLayer && map.getLayer("trailsLayer")) {
      map.setLayoutProperty("trailsLayer", "visibility", showTrails ? "visible" : "none");
    }
    if (map.getLayer && map.getLayer("trailsCenterLine")) {
      map.setLayoutProperty("trailsCenterLine", "visibility", showTrails ? "visible" : "none");
    }
    if (map.getLayer && map.getLayer("trailheads")) {
      map.setLayoutProperty("trailheads", "visibility", showTrails ? "visible" : "none");
    }
  });
}

// Wire up snapToggleBtn toggle behavior
if (snapToggleBtn) {
  snapToggleBtn.addEventListener("click", () => {
    snapToggle = !snapToggle;
    if (snapToggle) {
      snapToggleBtn.classList.add("active");
    } else {
      snapToggleBtn.classList.remove("active");
    }
  });
}

// ---------- Mode setup (uses drawModes module) ----------
const modesApi = setupModes?.({ map, Draw, panBtn, drawBtn, freeDrawBtn, segmentModeBtn }) || {};
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

// Fixed segment mode button handler
if (segmentModeBtn) {
  segmentModeBtn.addEventListener("click", () => {
    console.log("Switching to segment mode");
    map._mode = "segment"; // for your own checks
    map.getCanvas().style.cursor = "crosshair";
    map.dragPan.disable();
    
    // Use "segment" to match registration and drawModes.js
    Draw.changeMode("segment");
    setActive(segmentModeBtn);
  });
}

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

// ---------- UI handlers ----------
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportGpx?.(Draw, "route.gpx");
  });
}