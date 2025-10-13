import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		host: true, // Allow external connections for iframe integration
		fs: {
			strict: false // Allow serving files outside root for better caching
		}
	},
	optimizeDeps: {
		// Pre-bundle heavy dependencies to reduce load time
		include: ['tailwindcss']
	},
	css: {
		devSourcemap: false, // Disable CSS sourcemaps for faster dev builds
		preprocessorOptions: {
			// Tailwind optimization: reduce JIT work
		}
	},
	build: {
		rollupOptions: {
			output: {
				// Ensure consistent chunk names for integration
				manualChunks: {
					'modler-ui': ['$lib/components/PropertyPanel.svelte'],
					'modler-stores': ['$lib/stores/modler.ts'],
					'modler-bridge': ['$lib/bridge/threejs-bridge.ts']
				}
			}
		}
	}
});
