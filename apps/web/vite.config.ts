import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the same build runs from any host or sub-path.
  base: './',
  plugins: [svelte()],
});
