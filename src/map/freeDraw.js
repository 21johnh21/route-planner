// src/map/freeDraw.js
export function setupFreeDraw(map, Draw, trailGeoJSON, snapToggle, SPACING_METERS, SNAP_THRESHOLD_METERS) {
  // ---------- Free-draw state ----------
  let freeDrawing = false;
  let tempCoords = [];
  let snappingEnabled = snapToggle ? !!snapToggle.checked : true;

  // Update the on-map temporary line used while free-drawing
  function updateTempLine(coords) {
    const src = map.getSource("tempFreeDraw");
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords || [] },
          properties: {},
        },
      ],
    });
  }

  // ---------- Free-draw user interaction ----------
  map.on("mousedown", (e) => {
    if (map._mode !== "free") return;
    freeDrawing = true;
    const start = typeof snapToTrail === "function"
      ? snapToTrail(e.lngLat, trailGeoJSON, SNAP_THRESHOLD_METERS, snappingEnabled)
      : [e.lngLat.lng, e.lngLat.lat];
    tempCoords = [start];
    updateTempLine(tempCoords);
  });

  map.on("mousemove", (e) => {
    if (!freeDrawing || tempCoords.length === 0) return;

    const snapped = typeof snapToTrail === "function"
      ? snapToTrail(e.lngLat, trailGeoJSON, SNAP_THRESHOLD_METERS, snappingEnabled)
      : [e.lngLat.lng, e.lngLat.lat];

    const last = tempCoords[tempCoords.length - 1];
    const dist = typeof haversine === "function"
      ? haversine(last, snapped)
      : Math.hypot((last[0] - snapped[0]) * 111000, (last[1] - snapped[1]) * 111000); // fallback approx

    if (dist >= SPACING_METERS) {
      tempCoords.push(snapped);
      updateTempLine(tempCoords);
    }
  });

  map.on("mouseup", () => {
    if (map._mode === "free" && freeDrawing && tempCoords.length > 1) {
      const feature = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: tempCoords },
        properties: {},
      };
      try {
        Draw.add(feature);
        map.fire("draw.create", { features: [feature] });
      } catch (err) {
        console.error("Failed to add drawn feature:", err);
      }
      updateTempLine([]);
    }
    freeDrawing = false;
    tempCoords = [];
  });

  // ---------- snapToggle event ----------
  if (snapToggle) {
    snapToggle.addEventListener("change", (e) => {
      snappingEnabled = !!e.target.checked;
    });
  }
}