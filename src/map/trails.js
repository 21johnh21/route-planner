import osmtogeojson from "osmtogeojson";

// TODO: Eventually move this to my own api 

let trailLayerAdded = false;
let styleImageMissingListenerAdded = false;

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

    console.log("trailheadGeoJSON: ", trailheadGeoJSON);
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

export async function fetchTrails(map, bounds, showTrails) {
  const zoom = 12;
  const [s, w, n, e] = bounds;

  // Determine tiles that cover the bounding box
  const xMin = lon2tile(w, zoom);
  const xMax = lon2tile(e, zoom);
  const yMin = lat2tile(n, zoom);
  const yMax = lat2tile(s, zoom);

  const cacheExpiry = 3600000; // 1 hour in milliseconds

  // Arrays to hold features from all tiles
  let allTrailFeatures = [];
  let allTrailheadFeatures = [];

  // Helper to fetch and cache tile data
  async function fetchTile(x, y) {
    const cacheKey = `trailsTileCache_${zoom}_${x}_${y}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        const now = Date.now();
        if (now - cachedData.timestamp < cacheExpiry) {
          console.log(`Using cached tile data for tile ${zoom}/${x}/${y}`);
          return cachedData;
        }
      } catch (e) {
        // Ignore parsing errors and fetch fresh data
      }
    }

    const [tileS, tileW, tileN, tileE] = tile2bounds(x, y, zoom);

    // Overpass queries for this tile
    const trailQuery = `
      [out:json][timeout:25];
      (
        way["highway"~"path|footway|cycleway|pedestrian|track|steps|bridleway"](${tileS},${tileW},${tileN},${tileE});
        relation["route"~"hiking|bicycle|foot"](${tileS},${tileW},${tileN},${tileE});
        relation["leisure"="park"](${tileS},${tileW},${tileN},${tileE});
      );
      out body; >; out skel qt;
    `;

    const trailheadQuery = `
      [out:json][timeout:25];
      (
        node["information"="trailhead"]["informal"!="yes"]["parking"!="" ](${tileS},${tileW},${tileN},${tileE});
        node["amenity"="parking"]["access"!="private"]["hiking"="yes"](${tileS},${tileW},${tileN},${tileE});
      );
      out geom;
    `;

    const [trailRes, trailheadRes] = await Promise.all([
      fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(trailQuery)),
      fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(trailheadQuery))
    ]);

    const trailData = await trailRes.json();
    const trailheadData = await trailheadRes.json();

    const trailGeoJSON = osmtogeojson(trailData);
    const trailheadGeoJSON = osmtogeojson(trailheadData);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        trails: trailGeoJSON,
        trailheads: trailheadGeoJSON
      }));
    } catch (e) {
      // Ignore localStorage errors
    }

    return {
      trails: trailGeoJSON,
      trailheads: trailheadGeoJSON
    };
  }

  // Fetch all tiles in parallel
  const promises = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      promises.push(fetchTile(x, y));
    }
  }

  const tilesData = await Promise.all(promises);

  // Merge features from all tiles
  for (const tileData of tilesData) {
    if (tileData.trails && tileData.trails.features) {
      allTrailFeatures = allTrailFeatures.concat(tileData.trails.features);
    }
    if (tileData.trailheads && tileData.trailheads.features) {
      allTrailheadFeatures = allTrailheadFeatures.concat(tileData.trailheads.features);
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