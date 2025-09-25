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
    const lngLat = [e.lngLat.lng, e.lngLat.lat];
    const snapped = (state.snappingEnabled && snapToTrail) ? snapToTrail(e.lngLat) : lngLat;

    if (!state.startPoint) {
      state.startPoint = snapped;
    } else {
      // finalize the line
      state.line.geometry.coordinates = [state.startPoint, snapped];
      this.addFeature(state.line);
      this.map.fire("draw.create", { features: [state.line] });
      state.startPoint = null;
      state.line.geometry.coordinates = [];
      this.map.getSource("tempFreeDraw")?.setData({
        type: "FeatureCollection",
        features: []
      });
    }
  },

  onMouseMove(state, e) {
    if (!state.startPoint) return;

    const lngLat = [e.lngLat.lng, e.lngLat.lat];
    const snapped = (state.snappingEnabled && snapToTrail) ? snapToTrail(e.lngLat) : lngLat;

    this.map.getSource("tempFreeDraw")?.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [state.startPoint, snapped]
      }
    });
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