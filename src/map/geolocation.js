import mapboxgl from "mapbox-gl";
import { initMap } from "./initMap.js";

export async function getUserLocation(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout,
    });
  });
}

export async function initMapAtUser(defaultCenter = [-98.5795, 39.8283], defaultZoom = 12, userZoom = 13) {
  try {
    const pos = await getUserLocation();
    const coords = [pos.coords.longitude, pos.coords.latitude];
    const map = initMap(coords, userZoom);

    new mapboxgl.Marker({ color: "blue" })
      .setLngLat(coords)
      .setPopup(new mapboxgl.Popup().setText("You are here"))
      .addTo(map);

    return map;
  } catch (err) {
    console.warn("Geolocation failed, using default center:", err.message);
    return initMap(defaultCenter, defaultZoom);
  }
}

export async function centerMapOnUser(map) {
  try {
    const pos = await getUserLocation();
    const coords = [pos.coords.longitude, pos.coords.latitude];
    map.setCenter(coords);
    map.setZoom(13);

    new mapboxgl.Marker({ color: "blue" })
      .setLngLat(coords)
      .setPopup(new mapboxgl.Popup().setText("You are here"))
      .addTo(map);
  } catch (err) {
    console.warn("Unable to center on user:", err.message);
  }
}