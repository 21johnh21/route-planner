import osmtogeojson from "osmtogeojson";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

let trailLayerAdded = false;
let styleImageMissingListenerAdded = false;

// Use IndexedDB for larger storage capacity
const DB_NAME = "TrailCacheDB";
const DB_VERSION = 1;
const STORE_NAME = "tiles";
let db = null;

// In-memory cache for quick access (store only IDs and minimal data)
const memoryCache = new Map();
const loadedTiles = new Set();

// Feature deduplication - store features by OSM ID
const featureStore = new Map(); // osmId -> feature

// Request limiting
const MAX_CONCURRENT_REQUESTS = 4;
let fetchTimeout;

// Initialize IndexedDB
async function initDB() {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "tileKey" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

// Store tile data in IndexedDB
async function storeTileInDB(tileKey, data) {
  try {
    await initDB();
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    await store.put({
      tileKey,
      timestamp: Date.now(),
      data: data // Store compressed/minimal data
    });
  } catch (e) {
    console.warn(`Failed to store tile ${tileKey} in IndexedDB:`, e);
  }
}

// Get tile data from IndexedDB
async function getTileFromDB(tileKey) {
  try {
    await initDB();
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(tileKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn(`Failed to get tile ${tileKey} from IndexedDB:`, e);
    return null;
  }
}

// Clean up old tiles from IndexedDB
async function cleanupOldTiles() {
  try {
    await initDB();
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    
    const cutoff = Date.now() - (7 * 24 * 3600000); // 7 days
    const range = IDBKeyRange.upperBound(cutoff);
    
    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  } catch (e) {
    console.warn("Failed to cleanup old tiles:", e);
  }
}

// Run cleanup periodically
setInterval(cleanupOldTiles, 3600000); // Every hour

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

// Extract OSM ID from feature
function getFeatureId(feature) {
  if (!feature || !feature.properties) return null;
  // OSM features usually have an id or @id property
  return feature.properties.id || feature.properties['@id'] || feature.id;
}

// Add feature to store with deduplication
function addFeatureToStore(feature) {
  const osmId = getFeatureId(feature);
  if (!osmId) return;
  
  // Only store if we haven't seen this feature before
  if (!featureStore.has(osmId)) {
    featureStore.set(osmId, feature);
  }
}

// Get required tiles that haven't been loaded yet
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
      if (!loadedTiles.has(tileKey)) {
        requiredTiles.push({ x, y, key: tileKey });
      }
    }
  }
  return requiredTiles;
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

// Helper to fetch and cache tile data
async function fetchTile(x, y, tileKey, zoom) {
  // Check IndexedDB cache first
  const cached = await getTileFromDB(tileKey);
  const cacheExpiry = 24 * 3600000; // 24 hours
  
  if (cached && (Date.now() - cached.timestamp < cacheExpiry)) {
    console.log(`Using cached tile data for tile ${tileKey}`);
    
    // Add features to in-memory store
    if (cached.data.trails) {
      cached.data.trails.features.forEach(addFeatureToStore);
    }
    if (cached.data.trailheads) {
      cached.data.trailheads.features.forEach(addFeatureToStore);
    }
    
    loadedTiles.add(tileKey);
    return cached.data;
  }

  console.log(`Fetching tile ${tileKey} from API`);
  const response = await fetch(`${API_BASE_URL}/api/tiles/${zoom}/${x}/${y}`);
  const data = await response.json();

  let trailGeoJSON = { type: "FeatureCollection", features: [] };
  let trailheadGeoJSON = { type: "FeatureCollection", features: [] };

  try {
    if (data.trail_geojson && data.trail_geojson !== "null") {
      const parsedTrail = JSON.parse(data.trail_geojson);
      if (parsedTrail) {
        trailGeoJSON = osmtogeojson(parsedTrail);
        // Add to feature store with deduplication
        trailGeoJSON.features.forEach(addFeatureToStore);
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
        // Add to feature store with deduplication
        trailheadGeoJSON.features.forEach(addFeatureToStore);
      }
    }
  } catch (e) {
    console.warn(`Failed to parse trailhead_geojson for tile ${tileKey}:`, e);
  }

  const tileData = {
    trails: trailGeoJSON,
    trailheads: trailheadGeoJSON
  };

  // Store in IndexedDB (async, non-blocking)
  storeTileInDB(tileKey, tileData);
  
  loadedTiles.add(tileKey);
  return tileData;
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

    if (trailheadGeoJSON) {
      map.addSource("trailheads", { type: "geojson", data: trailheadGeoJSON });
      map.addLayer({
        id: "trailheads",
        type: "symbol",
        source: "trailheads",
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
          const size = 32;
          const radius = 12;
          const data = new Uint8ClampedArray(size * size * 4);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const dx = x - size / 2 + 0.5;
              const dy = y - size / 2 + 0.5;
              if (dx * dx + dy * dy <= radius * radius) {
                const offset = 4 * (y * size + x);
                data[offset] = 0;
                data[offset + 1] = 0;
                data[offset + 2] = 0;
                data[offset + 3] = 255;
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

// Debounced version of fetchTrails
export function debouncedFetchTrails(map, bounds, showTrails, delay = 300) {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    fetchTrails(map, bounds, showTrails);
  }, delay);
}

// Get features within bounds from feature store
function getFeaturesInBounds(bounds) {
  const [s, w, n, e] = bounds;
  const trailFeatures = [];
  const trailheadFeatures = [];
  
  for (const feature of featureStore.values()) {
    // Simple bounds check - in production you'd want more sophisticated geometry checking
    if (feature.geometry && feature.geometry.coordinates) {
      let inBounds = false;
      
      if (feature.geometry.type === "Point") {
        const [lon, lat] = feature.geometry.coordinates;
        inBounds = lon >= w && lon <= e && lat >= s && lat <= n;
      } else if (feature.geometry.type === "LineString") {
        // Check if any coordinate is in bounds
        inBounds = feature.geometry.coordinates.some(([lon, lat]) => 
          lon >= w && lon <= e && lat >= s && lat <= n
        );
      }
      
      if (inBounds) {
        // Categorize by type
        const type = feature.geometry.type;
        if (type === "Point" && feature.properties?.information === "trailhead") {
          trailheadFeatures.push(feature);
        } else if (type === "LineString" || type === "MultiLineString") {
          trailFeatures.push(feature);
        }
      }
    }
  }
  
  return { trailFeatures, trailheadFeatures };
}

export async function fetchTrails(map, bounds, showTrails) {
  const zoom = 12;
  const requiredTiles = getRequiredTiles(bounds, zoom);
  
  if (requiredTiles.length === 0) {
    console.log("All tiles already loaded, using cached data");
  } else {
    console.log(`Fetching ${requiredTiles.length} new tiles`);
    await fetchTilesWithLimit(requiredTiles, zoom);
  }
  
  // Get deduplicated features within current bounds
  const { trailFeatures, trailheadFeatures } = getFeaturesInBounds(bounds);
  
  const mergedTrailGeoJSON = {
    type: "FeatureCollection",
    features: trailFeatures
  };
  
  const mergedTrailheadGeoJSON = {
    type: "FeatureCollection",
    features: trailheadFeatures
  };
  
  console.log(`Displaying ${trailFeatures.length} trails and ${trailheadFeatures.length} trailheads`);
  
  addTrailLayer(map, mergedTrailGeoJSON, mergedTrailheadGeoJSON, showTrails);
  
  return { trails: mergedTrailGeoJSON, trailheads: mergedTrailheadGeoJSON };
}

// Clear old data from memory periodically
export function clearOldMemoryCache() {
  if (featureStore.size > 10000) {
    console.log("Memory cache too large, clearing oldest entries");
    // Keep only the most recent 5000 features
    const entries = Array.from(featureStore.entries());
    featureStore.clear();
    entries.slice(-5000).forEach(([id, feature]) => {
      featureStore.set(id, feature);
    });
  }
}

// Call this periodically
setInterval(clearOldMemoryCache, 60000); // Every minute