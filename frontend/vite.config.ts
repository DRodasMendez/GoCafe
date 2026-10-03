import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Escucha en la red local (no solo en esta computadora) para poder abrir el sistema desde una
    // tablet o celular conectado al mismo Wi-Fi: http://<IP-de-esta-computadora>:5173
    host: true,
    // Las llamadas a /api se reenvían al backend. Así el navegador (de cualquier dispositivo) solo
    // habla con este servidor y no necesita saber dónde corre la API ni pasar por CORS.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
