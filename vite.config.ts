import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-404-for-github-pages',
        closeBundle() {
          try {
            const indexHtml = path.resolve(__dirname, 'dist', 'index.html');
            const notFoundHtml = path.resolve(__dirname, 'dist', '404.html');
            if (fs.existsSync(indexHtml)) {
              fs.copyFileSync(indexHtml, notFoundHtml);
            }
          } catch (e) {
            console.warn('Failed to copy 404.html:', e);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
