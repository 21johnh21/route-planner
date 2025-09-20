import { geojsonToGpx } from './geojsonToGpx';

/**
 * Export the drawn features as a GPX file.
 * @param {Object} Draw - The Mapbox Draw instance containing the features.
 * @param {string} filename - The desired filename for the exported GPX file.
 */
export function exportGpx(Draw, filename) {
  const data = Draw.getAll();
  if (data.features.length > 0) {
    const gpx = geojsonToGpx(data);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    alert('No features to export');
  }
}
