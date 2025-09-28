import osmtogeojson from "osmtogeojson";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

let trailLayerAdded = false;
let styleImageMissingListenerAdded = false;

// Spatial boundary tracking
let loadedBounds = [];
let cachedTiles = new Map();

// Request limiting
const MAX_CONCURRENT_REQUESTS = 4;

// Debouncing
let fetchTimeout;

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 -
      Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

function tile2bounds(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon1 = (x / n) * 360 - 180;
  const lon2 = ((x + 1) / n) * 360 - 180;

  const lat1 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const lat2 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;

  // Return south, west, north, east
  return [lat2, lon1, lat1, lon2];
}

// Check if an area has already been loaded
function isAreaAlreadyLoaded(bounds) {
  const [s, w, n, e] = bounds;
  return loadedBounds.some(loaded => 
    loaded.s <= s && loaded.w <= w && loaded.n >= n && loaded.e >= e
  );
}

// Add bounds to loaded areas
function addToLoadedBounds(bounds) {
  loadedBounds.push({
    s: bounds[0],
    w: bounds[1], 
    n: bounds[2],
    e: bounds[3]
  });
  
  // Optional: merge overlapping bounds to optimize (simple version)
  if (loadedBounds.length > 10) {
    // Keep only the last 10 bounds to prevent memory bloat
    loadedBounds = loadedBounds.slice(-10);
  }
}

// Get tiles that need to be fetched (not in cache)
function getRequiredTiles(bounds, zoom) {
  const [s, w, n, e] = bounds;
  const xMin = lon2tile(w, zoom);
  const xMax = lon2tile(e, zoom);
  const yMin = lat2tile(n, zoom);
  const yMax = lat2tile(s, zoom);
  
  const requiredTiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const tileKey = `${zoom}/${x}/${y}`;
      if (!cachedTiles.has(tileKey) || isTileExpired(tileKey)) {
        requiredTiles.push({x, y, key: tileKey});
      }
    }
  }
  return requiredTiles;
}

// Check if a cached tile has expired
function isTileExpired(tileKey) {
  const cached = cachedTiles.get(tileKey);
  if (!cached) return true;
  
  const cacheExpiry = 24 * 3600000; // 24 hours instead of 1 hour
  const now = Date.now();
  return now - cached.timestamp >= cacheExpiry;
}

// Fetch tiles with concurrency limiting
async function fetchTilesWithLimit(tiles, zoom) {
  const results = [];
  for (let i = 0; i < tiles.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = tiles.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const batchPromises = batch.map(tile => fetchTile(tile.x, tile.y, tile.key, zoom));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  return results;
}

export function addTrailLayer(map, trailGeoJSON, trailheadGeoJSON, showTrails = true) {
  if (!trailLayerAdded) {
    map.addSource("trails", { type: "geojson", data: trailGeoJSON });
    map.addLayer({
      id: "trailsLayer",
      type: "line",
      source: "trails",
      paint: { 
        "line-color": "#808080", 
        "line-width": 4,
        "line-dasharray": [3, 4],
        "line-opacity": 0.7
      },
    });
    map.addLayer({
      id: "trailsCenterLine",
      type: "line",
      source: "trails",
      paint: {
        "line-color": "#FFFF00",
        "line-width": 2,
        "line-opacity": 0.7,
        "line-dasharray": [1, 0]
      },
    });

    //console.log("trailheadGeoJSON: ", trailheadGeoJSON);
    if (trailheadGeoJSON) {
      map.addSource("trailheads", { type: "geojson", data: trailheadGeoJSON });
      map.addLayer({
        id: "trailheads",
        type: "symbol",
        source: "trailheads", // Use the trailhead source
        layout: {
          "icon-image": "trailhead-icon",
          "icon-size": 1.2,
          "icon-allow-overlap": true,
          "text-offset": [0, 1.5],
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#000000"
        }
      });
    }

    trailLayerAdded = true;

    if (map && typeof map.on === "function" && !styleImageMissingListenerAdded) {
      map.on("styleimagemissing", function(e) {
        if (e.id === "trailhead-icon") {
          // Create a small solid circle icon (e.g., 32x32 px, black circle)
          const size = 32;
          const radius = 12;
          const data = new Uint8ClampedArray(size * size * 4);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const dx = x - size / 2 + 0.5;
              const dy = y - size / 2 + 0.5;
              if (dx * dx + dy * dy <= radius * radius) {
                // Black circle with full opacity
                const offset = 4 * (y * size + x);
                data[offset] = 0;     // R
                data[offset + 1] = 0; // G
                data[offset + 2] = 0; // B
                data[offset + 3] = 255; // A
              }
            }
          }
          map.addImage(
            "trailhead-icon",
            { width: size, height: size, data: data },
            { pixelRatio: 2 }
          );
        }
      });
      styleImageMissingListenerAdded = true;
    }
    
  } else {
    map.getSource("trails").setData(trailGeoJSON);
    if (trailheadGeoJSON && map.getSource("trailheads")) {
      map.getSource("trailheads").setData(trailheadGeoJSON);
    }
  }

  const visible = showTrails;
  map.setLayoutProperty("trailsLayer", "visibility", visible ? "visible" : "none");
  map.setLayoutProperty("trailsCenterLine", "visibility", visible ? "visible" : "none");
  if (map.getLayer("trailheads")) {
    map.setLayoutProperty("trailheads", "visibility", visible ? "visible" : "none");
  }
}

// Helper to fetch and cache tile data
async function fetchTile(x, y, tileKey, zoom) {
  // Check in-memory cache first
  const cached = cachedTiles.get(tileKey);
  if (cached && !isTileExpired(tileKey)) {
    //console.log(`Using in-memory cached tile data for tile ${tileKey}`);
    return cached;
  }

  // Check localStorage cache
  const cacheKey = `trailsTileCache_${tileKey}`;
  const localCached = localStorage.getItem(cacheKey);
  if (localCached) {
    try {
      const cachedData = JSON.parse(localCached);
      const cacheExpiry = 24 * 3600000; // 24 hours
      const now = Date.now();
      if (now - cachedData.timestamp < cacheExpiry) {
        //console.log(`Using localStorage cached tile data for tile ${tileKey}`);
        // Store in in-memory cache for faster access
        cachedTiles.set(tileKey, cachedData);
        return cachedData;
      }
    } catch (e) {
      // Ignore parsing errors and fetch fresh data
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/tiles/${zoom}/${x}/${y}`);
  //console.log(`Tile data response ${response}`);
  const data = await response.json();
  //console.log("Fetched tile JSON for z/x/y:", zoom, x, y, data);

  let trailGeoJSON = { type: "FeatureCollection", features: [] };
  let trailheadGeoJSON = { type: "FeatureCollection", features: [] };

  try {
    if (data.trail_geojson && data.trail_geojson !== "null") {
      const parsedTrail = JSON.parse(data.trail_geojson);
      if (parsedTrail) {
        trailGeoJSON = osmtogeojson(parsedTrail);
      }
    }
  } catch (e) {
    console.warn(`Failed to parse trail_geojson for tile ${tileKey}:`, e);
  }

  try {
    if (data.trailhead_geojson && data.trailhead_geojson !== "null") {
      const parsedTrailhead = JSON.parse(data.trailhead_geojson);
      if (parsedTrailhead) {
        trailheadGeoJSON = osmtogeojson(parsedTrailhead);
      }
    }
  } catch (e) {
    console.warn(`Failed to parse trailhead_geojson for tile ${tileKey}:`, e);
  }

  const tileData = {
    timestamp: Date.now(),
    trails: trailGeoJSON,
    trailheads: trailheadGeoJSON
  };

  // Store in both in-memory and localStorage cache
  cachedTiles.set(tileKey, tileData);
  
  try {
    localStorage.setItem(cacheKey, JSON.stringify(tileData));
  } catch (e) {
    // Ignore localStorage errors (quota exceeded, etc.)
    console.warn(`Failed to cache tile ${tileKey} in localStorage:`, e);
  }

  return tileData;
}

// Debounced version of fetchTrails
export function debouncedFetchTrails(map, bounds, showTrails, delay = 300) {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    fetchTrails(map, bounds, showTrails);
  }, delay);
}

export async function fetchTrails(map, bounds, showTrails) {
  // Check if this area has already been loaded
  if (isAreaAlreadyLoaded(bounds)) {
    console.log("Area already loaded, skipping API calls");
    return;
  }

  const zoom = 12;
  const [s, w, n, e] = bounds;

  // Get only the tiles that need to be fetched
  const requiredTiles = getRequiredTiles(bounds, zoom);
  
  if (requiredTiles.length === 0) {
    console.log("All tiles already cached, skipping API calls");
    
    // Still need to merge and display cached data
    const [s, w, n, e] = bounds;
    const xMin = lon2tile(w, zoom);
    const xMax = lon2tile(e, zoom);
    const yMin = lat2tile(n, zoom);
    const yMax = lat2tile(s, zoom);
    
    let allTrailFeatures = [];
    let allTrailheadFeatures = [];
    
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tileKey = `${zoom}/${x}/${y}`;
        const cached = cachedTiles.get(tileKey);
        if (cached) {
          if (cached.trails && cached.trails.features) {
            allTrailFeatures = allTrailFeatures.concat(cached.trails.features);
          }
          if (cached.trailheads && cached.trailheads.features) {
            allTrailheadFeatures = allTrailheadFeatures.concat(cached.trailheads.features);
          }
        }
      }
    }
    
    const mergedTrailGeoJSON = {
      type: "FeatureCollection",
      features: allTrailFeatures
    };
    
    const mergedTrailheadGeoJSON = {
      type: "FeatureCollection",
      features: allTrailheadFeatures
    };
    
    addTrailLayer(map, mergedTrailGeoJSON, mergedTrailheadGeoJSON, showTrails);
    return { trails: mergedTrailGeoJSON, trailheads: mergedTrailheadGeoJSON };
  }

  console.log(`Fetching ${requiredTiles.length} tiles out of ${(lon2tile(e, zoom) - lon2tile(w, zoom) + 1) * (lat2tile(s, zoom) - lat2tile(n, zoom) + 1)} total tiles in bounds`);

  // Fetch required tiles with concurrency limiting
  const tilesData = await fetchTilesWithLimit(requiredTiles, zoom);

  // Get all tiles in bounds (including cached ones) for merging
  const xMin = lon2tile(w, zoom);
  const xMax = lon2tile(e, zoom);
  const yMin = lat2tile(n, zoom);
  const yMax = lat2tile(s, zoom);

  // Arrays to hold features from all tiles
  let allTrailFeatures = [];
  let allTrailheadFeatures = [];

  // Merge features from all tiles (both newly fetched and cached)
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const tileKey = `${zoom}/${x}/${y}`;
      const tileData = cachedTiles.get(tileKey);
      
      if (tileData) {
        if (tileData.trails && tileData.trails.features) {
          allTrailFeatures = allTrailFeatures.concat(tileData.trails.features);
        }
        if (tileData.trailheads && tileData.trailheads.features) {
          allTrailheadFeatures = allTrailheadFeatures.concat(tileData.trailheads.features);
        }
      }
    }
  }

  const mergedTrailGeoJSON = {
    type: "FeatureCollection",
    features: allTrailFeatures
  };
  console.log("Merged trailGeoJSON:", mergedTrailGeoJSON);

  const mergedTrailheadGeoJSON = {
    type: "FeatureCollection",
    features: allTrailheadFeatures
  };
  //console.log("Merged trailheadGeoJSON:", mergedTrailheadGeoJSON);

  addTrailLayer(map, mergedTrailGeoJSON, mergedTrailheadGeoJSON, showTrails);

  // Mark this area as loaded
  addToLoadedBounds(bounds);

  return { trails: mergedTrailGeoJSON, trailheads: mergedTrailheadGeoJSON };
}