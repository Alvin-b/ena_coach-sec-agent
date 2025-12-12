import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This allows the frontend simulation to access process.env.API_KEY if needed,
    // though in production we should be careful with keys.
    'process.env': {} 
  }
});