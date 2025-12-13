import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose the API Key to the frontend
      // Priority: VITE_GEMINI_API_KEY -> GEMINI_API_KEY -> API_KEY
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || env.API_KEY || ''),
      // Polyfill process.env for other libraries
      'process.env': {} 
    },
    server: {
      proxy: {
        '/webhook': {
          target: 'http://localhost:10000',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:10000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});