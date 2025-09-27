// src/map/modes/segmentMode.js
import { snapToTrail, haversine } from "./snapping.js";

const SNAP_THRESHOLD_METERS = 100;

// Store draw instance externally to avoid cyclic references
let externalDrawInstance = null;

const SegmentMode = {
  // Static method to set draw instance
  setDrawInstance(draw) {
    externalDrawInstance = draw;
  },

  onSetup(opts = {}) {
    console.log("SegmentMode onSetup has run");
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
    if (!state) {
      console.warn("SegmentMode onClick called without state");
      return;
    }
    
    const clicked = [e.lngLat.lng, e.lngLat.lat];

    if (!state.startPoint) {
      // First click: set the start point
      state.startPoint = clicked;
      return;
    }

    // Second (or later) click: finish a line from startPoint → clicked
    // Gather all existing endpoints from saved Draw features
    let endpoints = [];
    
    if (externalDrawInstance) {
      try {
        const allData = externalDrawInstance.getAll();
        
        if (allData && allData.features && Array.isArray(allData.features)) {
          for (const feature of allData.features) {
            if (feature.geometry && feature.geometry.type === "LineString" && 
                feature.geometry.coordinates && feature.geometry.coordinates.length > 0) {
              const coords = feature.geometry.coordinates;
              endpoints.push(coords[0]); // start point
              endpoints.push(coords[coords.length - 1]); // end point
            }
          }
        }
      } catch (err) {
        console.warn("Could not get features from external draw instance:", err);
      }
    }

    // Snap clicked point to closest endpoint if within threshold
    let snappedClicked = clicked;
    let minDist = Infinity;
    let snapped = false;
    
    for (const pt of endpoints) {
      // Skip snapping to the start point
      if (pt[0] === state.startPoint[0] && pt[1] === state.startPoint[1]) {
        continue;
      }

      const dist = haversine([pt[1], pt[0]], [clicked[1], clicked[0]]);
      
      if (dist < SNAP_THRESHOLD_METERS && dist < minDist) {
        minDist = dist;
        snappedClicked = pt;
        snapped = true;
      }
    }
    
    if (snapped) {
      console.log("Snapped to endpoint, distance:", minDist.toFixed(1), "meters");
    }

    // Create a new feature
    try {
      const featureId = this.newFeature({
        type: "Feature",
        geometry: { 
          type: "LineString", 
          coordinates: [state.startPoint, snappedClicked] 
        },
        properties: {}
      });
      
      this.addFeature(featureId);
      
    } catch (err) {
      console.error("Error adding feature:", err);
      
      // Fallback: try using external draw instance
      if (externalDrawInstance) {
        try {
          const geoJsonFeature = {
            type: "Feature",
            geometry: { 
              type: "LineString", 
              coordinates: [state.startPoint, snappedClicked] 
            },
            properties: {}
          };
          
          externalDrawInstance.add(geoJsonFeature);
        } catch (fallbackErr) {
          console.error("Fallback feature creation also failed:", fallbackErr);
        }
      }
    }

    // Set new start point for chaining ONLY if not snapped
    if (snapped) {
      // If we snapped, clear the start point to end segment mode
      state.startPoint = null;
      console.log("Snapped to endpoint - ending segment mode");
    } else {
      // If no snap, continue chaining from the clicked point
      state.startPoint = snappedClicked;
    }
    
    // Clear the temporary preview line
    const tempSrc = this.map.getSource("tempFreeDraw");
    if (tempSrc) {
      tempSrc.setData({ type: "FeatureCollection", features: [] });
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
    if (state) {
      state.startPoint = null;
    }
    
    const src = this.map?.getSource("tempFreeDraw");
    if (src) {
      src.setData({
        type: "FeatureCollection",
        features: []
      });
    }
  },

  toDisplayFeatures(state, geojson, display) {
    if (geojson && geojson.geometry && geojson.geometry.type === "LineString") {
      geojson.properties = { ...geojson.properties, "user_mode": "segment" };
    }
    display(geojson);
  }
};

export default SegmentMode;