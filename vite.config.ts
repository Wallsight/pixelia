import { defineConfig } from 'vite';

// Everything (textures, models, audio) is generated at runtime, so the page
// never needs a third-party origin. The policy below forbids all of them.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=()',
};

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path (e.g. GitHub Pages /pixelia/).
  base: './',
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1', // loopback only: never expose the dev server to the network
    port: 5173,
    strictPort: true,
    fs: { strict: true },
    headers: securityHeaders,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: securityHeaders,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
