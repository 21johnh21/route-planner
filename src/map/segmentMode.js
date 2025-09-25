// src/map/modes/segmentMode.js
import { snapToTrail } from "./snapping.js";

const SegmentMode = {
  onSetup() {
    return {
      line: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: []
        }
      },
      startPoint: null,
      snappingEnabled: true
    };
  },

  onClick(state, e) {
    const clicked = [e.lngLat.lng, e.lngLat.lat];
    console.log("SegmentMode click at", clicked, "snapping:", state.snappingEnabled);

    if (!state.startPoint) {
      // First click: set the start point
      state.startPoint = clicked;
    } else {
      // Second (or later) click: finish a line from startPoint → clicked
      const line = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [state.startPoint, clicked] },
        properties: {}
      };
      const feature = this.newFeature(line);
      this.addFeature(feature);
      this.map.fire("draw.create", { features: [feature.toGeoJSON()] });

      // Set new start point for chaining
      state.startPoint = clicked;
    }
  },

  onMouseMove(state, e) {
    if (!state.startPoint) return;

    const preview = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [state.startPoint, [e.lngLat.lng, e.lngLat.lat]] },
      properties: { temp: true }
    };

    const src = this.map.getSource("tempFreeDraw");
    if (src) {
      src.setData({ type: "FeatureCollection", features: [preview] });
    }
  },

  onMouseDown() {},

  onMouseUp() {},

  onStop(state) {
    state.startPoint = null;
    this.map.getSource("tempFreeDraw")?.setData({
      type: "FeatureCollection",
      features: []
    });
  },

  toDisplayFeatures(state, geojson, display) {
    if (geojson.geometry.type === "LineString") {
      geojson.properties = { ...geojson.properties, "user_mode": "segment" };
    }
    display(geojson);
  }
};

export default SegmentMode;