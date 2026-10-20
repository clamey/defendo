import { defineConfig } from 'vite';

// Relative asset paths, so the build works both at the domain root (defendo.net)
// and under a subpath (clamey.github.io/defendo/).
export default defineConfig({
  base: './',
});
