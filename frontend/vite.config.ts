import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces (LAN accessible)
    port: 5173,
    proxy: {
      "/uploads": {
        target: process.env.VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
      },
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
