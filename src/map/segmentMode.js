// src/map/modes/segmentMode.js
import { snapToTrail, haversine } from "./snapping.js";

const SNAP_THRESHOLD_METERS = 25;

// Store draw instance externally to avoid cyclic references
let externalDrawInstance = null;

const SegmentMode = {
  // Static method to set draw instance
  setDrawInstance(draw) {
    externalDrawInstance = draw;
    console.log("SegmentMode: Draw instance set:", !!draw, draw);
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
    console.log("SegmentMode onClick with state:", state);
    const clicked = [e.lngLat.lng, e.lngLat.lat];

    if (!state.startPoint) {
      // First click: set the start point
      state.startPoint = clicked;
    } else {
      // Second (or later) click: finish a line from startPoint → clicked

      // Gather all existing endpoints from saved Draw features
      let endpoints = [];
      
      // Try multiple approaches to get existing features
      console.log("External draw instance available:", !!externalDrawInstance);
      
      if (externalDrawInstance) {
        try {
          const allData = externalDrawInstance.getAll();
          console.log("Draw getAll() returned:", allData);
          
          if (allData && allData.features && Array.isArray(allData.features)) {
            console.log("Found", allData.features.length, "features in draw");
            
            for (const feature of allData.features) {
              console.log("Processing feature:", feature);
              
              if (feature.geometry && feature.geometry.type === "LineString" && 
                  feature.geometry.coordinates && feature.geometry.coordinates.length > 0) {
                const coords = feature.geometry.coordinates;
                const startPoint = coords[0];
                const endPoint = coords[coords.length - 1];
                
                endpoints.push(startPoint);
                endpoints.push(endPoint);
                
                console.log("Added endpoints:", startPoint, endPoint);
              }
            }
          } else {
            console.warn("getAll() did not return expected structure:", allData);
          }
        } catch (err) {
          console.warn("Could not get features from external draw instance:", err);
        }
      } else {
        console.warn("External draw instance not available");
      }

      console.log("Existing endpoints found:", endpoints.length, endpoints);

      // Snap clicked point to closest endpoint if within threshold
      let snappedClicked = clicked;
      let minDist = Infinity;
      let snapped = false;
      
      console.log("Checking snap for clicked point:", clicked);
      
      for (const pt of endpoints) {
        // Skip snapping to the start point or the exact clicked point
        if ((pt[0] === state.startPoint[0] && pt[1] === state.startPoint[1]) ||
            (pt[0] === clicked[0] && pt[1] === clicked[1])) {
          console.log("Skipping endpoint (same as start or clicked):", pt);
          continue;
        }

        const dist = haversine([pt[1], pt[0]], [clicked[1], clicked[0]]);
        console.log("Distance from", clicked, "to endpoint", pt, "is", dist, "meters");
        
        if (dist < SNAP_THRESHOLD_METERS && dist < minDist) {
          minDist = dist;
          snappedClicked = pt;
          snapped = true;
          console.log("NEW SNAP CANDIDATE:", pt, "distance:", dist);
        }
      }
      
      if (snapped) {
        console.log("FINAL SNAP: Snapping", clicked, "to", snappedClicked, "distance:", minDist);
      } else {
        console.log("NO SNAP: Using original clicked point", clicked);
      }

      // Create a new feature safely without cyclic references
      console.log("Creating new segment feature from", state.startPoint, "to", snappedClicked);

      try {
        // Create the feature using Draw's methods
        const featureId = this.newFeature({
          type: "Feature",
          geometry: { 
            type: "LineString", 
            coordinates: [state.startPoint, snappedClicked] 
          },
          properties: {}
        });
        
        this.addFeature(featureId);
        console.log("Feature added successfully with ID:", featureId.id || featureId);
        
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
            
            const ids = externalDrawInstance.add(geoJsonFeature);
            console.log("Feature added via fallback method with IDs:", ids);
          } catch (fallbackErr) {
            console.error("Fallback feature creation also failed:", fallbackErr);
          }
        }
      }

      // Set new start point for chaining
      state.startPoint = snappedClicked;

      if (snapped) {
        console.log("Segment added. Snapped to existing endpoint.");
      }
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