import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', 'monaco-editor'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        simulator: new URL('./simulator.html', import.meta.url).pathname,
        v86: new URL('./index-v86.html', import.meta.url).pathname,
      },
    },
  },
});