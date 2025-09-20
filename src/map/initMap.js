import mapboxgl from "mapbox-gl";

export function initMap(defaultCenter) {
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/outdoors-v12",
    center: defaultCenter,
    zoom: 3,
  });

  map.addControl(new mapboxgl.NavigationControl());
  return map;
}