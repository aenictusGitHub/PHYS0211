import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The same laboratory components run entirely in the browser on GitHub Pages.
// Keep Vinext and its local/Sites configuration unchanged.
export default defineConfig({
  root: fileURLToPath(new URL('./pages-site', import.meta.url)),
  base: '/PHYS0211/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/pages', import.meta.url)),
    emptyOutDir: true,
  },
});
