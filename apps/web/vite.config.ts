import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: 'localhost' },
  preview: { port: 4173, strictPort: true, host: 'localhost' },
  build: { target: 'es2022', sourcemap: true },
});
