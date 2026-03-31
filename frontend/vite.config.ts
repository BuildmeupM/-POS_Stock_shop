import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/modals', '@mantine/notifications'],
          'vendor-utils': ['axios', '@tanstack/react-query', 'zustand'],
          'vendor-icons': ['@tabler/icons-react'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
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
