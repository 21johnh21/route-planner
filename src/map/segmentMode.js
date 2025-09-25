// src/map/modes/segmentMode.js
import { snapToTrail, haversine } from "./snapping.js";

const SPACING_METERS = 10;
const SNAP_THRESHOLD_METERS = 20;

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
      currentVertexPosition: 0,
      freeDrawing: false,
      tempCoords: [],
      snappingEnabled: true
    };
  },

  onClick(state, e) {
    // toggle snapping on click (optional behavior)
    state.snappingEnabled = !state.snappingEnabled;
  },

  onMouseDown(state, e) {
    state.freeDrawing = true;
    state.tempCoords = [];
    const lngLat = [e.lngLat.lng, e.lngLat.lat];
    const snapped = (state.snappingEnabled && snapToTrail) ? snapToTrail(e.lngLat) : lngLat;
    state.tempCoords.push(snapped);
    this.map.getSource("tempFreeDraw")?.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: state.tempCoords
      }
    });
    console.log("SegmentMode: Started drawing at", snapped);
  },

  onMouseMove(state, e) {
    if (!state.freeDrawing) return;

    const lastCoord = state.tempCoords[state.tempCoords.length - 1];
    const currentCoord = [e.lngLat.lng, e.lngLat.lat];

    const distance = haversine(lastCoord, currentCoord);
    if (distance >= SPACING_METERS) {
      const snapped = (state.snappingEnabled && snapToTrail) ? snapToTrail(e.lngLat) : currentCoord;
      state.tempCoords.push(snapped);

      this.map.getSource("tempFreeDraw")?.setData({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: state.tempCoords
        }
      });
    }
  },

  onMouseUp(state, e) {
    if (!state.freeDrawing) return;

    state.freeDrawing = false;

    if (state.tempCoords.length > 1) {
      state.line.geometry.coordinates = state.line.geometry.coordinates.concat(state.tempCoords);
      state.currentVertexPosition = state.line.geometry.coordinates.length;

      this.addFeature(state.line);
      this.map.fire("draw.create", { features: [state.line] });
      this.map.getSource("tempFreeDraw")?.setData({
        type: "FeatureCollection",
        features: []
      });
      state.tempCoords = [];
    }
  },

  onStop(state) {
    if (state.line.geometry.coordinates.length > 1) {
      this.addFeature(state.line);
      this.map.fire("draw.create", { features: [state.line] });
    }
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