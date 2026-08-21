import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev` — plain http://localhost for desktop work.
// `npm run dev:lan` — HTTPS on all interfaces so a phone on the same Wi-Fi can open the AR
// viewer (WebXR refuses to run over plain HTTP). The phone will warn about the self-signed cert; accept it once.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'lan' ? [basicSsl()] : [])],
  server: mode === 'lan' ? { host: true, port: 5173 } : undefined,
}));
