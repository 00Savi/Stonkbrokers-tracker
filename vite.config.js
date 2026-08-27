import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Deep links on GitHub Pages.
 *
 * Pages serves static files and has no rewrite rules, so a request for
 * /stonkbrokers/yield looks for a file at that path, does not find one, and
 * returns its 404 page. That is what made every refresh outside `/` fail.
 *
 * Pages does let you supply that 404 page. Writing index.html to 404.html means
 * an unmatched path still boots the app, and the router then reads the URL that
 * was originally requested from `location` -- the redirect is invisible and the
 * address bar keeps the real path.
 *
 * A byte-copy rather than a stub, because the copy has to carry the hashed
 * asset tags. Generating it in `closeBundle` is what keeps it correct: the
 * filenames change on every build, and a hand-maintained 404.html would go
 * stale the first time a chunk hash moved.
 */
function spaFallback() {
  return {
    name: 'spa-fallback',
    closeBundle() {
      const dir = path.resolve(process.cwd(), 'docs');
      const index = path.join(dir, 'index.html');
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(dir, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  // shadcn generates imports as `@/lib/utils` and `@/components/ui/...`, so the
  // alias has to exist for the bundler as well as for the editor (jsconfig).
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  build: {
    outDir: 'docs',
  },
});
