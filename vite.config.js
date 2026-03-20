import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3000,
        cors: true,
        // Don't open browser automatically
        open: false
    },
    // Exclude vendor files from Vite's dependency optimization
    optimizeDeps: {
        exclude: ['three']
    }
});
