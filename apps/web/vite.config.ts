// Vite configuration for the CloudOps Hub web app
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
        // Direct browser navigations to /health must render the SPA route
        // rather than the API's raw JSON payload. Requests that explicitly
        // ask for JSON (fetch/XHR) still get proxied to the API.
        bypass(req) {
          const accept = String(req.headers.accept ?? '');
          return accept.includes('text/html') ? '/index.html' : undefined;
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
