import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // shadcn generates imports as `@/lib/utils` and `@/components/ui/...`, so the
  // alias has to exist for the bundler as well as for the editor (jsconfig).
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  build: {
    outDir: 'docs'
  }
});
