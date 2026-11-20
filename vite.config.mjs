import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { transform as oxcTransform } from 'rolldown/utils';

// Source files under src/ contain JSX but use the .js extension (CRA convention).
// Vite 8 only enables JSX parsing for .jsx/.tsx (esbuild loader options are ignored),
// so transform src/**/*.js as JSX before Vite's own pipeline sees it.
const jsxInSrcJs = {
  name: 'ledger:jsx-in-src-js',
  enforce: 'pre',
  async transform(code, id) {
    const file = id.split('?')[0];
    if (!/\/src\/.*\.js$/.test(file) || file.includes('/node_modules/')) return null;
    const result = await oxcTransform(file, code, {
      lang: 'jsx',
      jsx: { runtime: 'automatic' },
      sourcemap: true,
    });
    if (result.errors?.length) {
      this.error(result.errors[0].message);
    }
    return { code: result.code, map: result.map };
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [jsxInSrcJs, react(), tailwindcss()],

  // Keep the existing REACT_APP_* variables in .env / .env.local working.
  envPrefix: ['VITE_', 'REACT_APP_'],

  build: {
    outDir: 'dist',
  },

  // The dependency scanner parses src/*.js before the transform above runs.
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: { '.js': 'jsx' },
    },
  },

  server: {
    host: '0.0.0.0',
    port: 3100,
    strictPort: true,
    allowedHosts: true,
    watch: {
      usePolling: !!process.env.CHOKIDAR_USEPOLLING,
    },
    hmr: process.env.VITE_HMR_CLIENT_PORT
      ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
      : undefined,
    // Under Warden, Traefik routes /api before it reaches Vite, so this only matters outside Warden.
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://127.0.0.1:8788',
    },
  },
});
