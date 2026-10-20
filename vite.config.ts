import { defineConfig } from 'vite';

// GitHub Pages serves the site from /defendo/, so built asset URLs need that prefix.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/defendo/' : '/',
});
