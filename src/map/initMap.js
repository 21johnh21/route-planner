import mapboxgl from "mapbox-gl";

export function initMap(center = [-98.5795, 39.8283], zoom = 12) {
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/outdoors-v12",
    center,
    zoom,
  });

  map.addControl(new mapboxgl.NavigationControl());
  return map;
}