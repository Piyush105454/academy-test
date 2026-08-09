import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
    middlewareMode: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  publicDir: "public",
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify("https://bkafweywaswykowzrhmx.supabase.co"),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ3MzQsImV4cCI6MjA4NDg1MDczNH0.8e9UWH1mx2D1aQrgRV4OzlgmBBDJ30wTRHLMi8gTxqM"),
  },
});
