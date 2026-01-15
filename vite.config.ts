
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose the API Key to the frontend
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || env.API_KEY || ''),
      // Polyfill process.env for other libraries
      'process.env': {} 
    },
    server: {
      proxy: {
        '/webhook': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
