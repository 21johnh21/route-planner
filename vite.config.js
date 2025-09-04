import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'mapbox-gl': 'mapbox-gl/dist/mapbox-gl.js'
    }
  }
});