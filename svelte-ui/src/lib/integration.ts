/**
 * Integration script for embedding Svelte UI components into the existing Modler V2 application
 * This script provides the bridge between the vanilla JS Three.js app and Svelte components
 */

import { bridge } from '$lib/bridge/threejs-bridge';

/**
 * Initialize Svelte UI integration with the existing Modler application
 * Call this after the Three.js components are loaded
 */
export function initializeSvelteUI() {
	// Wait for DOM to be ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initializeComponents);
	} else {
		initializeComponents();
	}
}

/**
 * Initialize individual Svelte components
 */
function initializeComponents() {
	try {
		// Initialize the bridge with Three.js components
		if (typeof window !== 'undefined' && (window as any).modlerComponents) {
			bridge.initialize((window as any).modlerComponents);
		} else {
			console.warn('modlerComponents not found - Svelte UI integration failed');
		}

		// Replace specific UI components
		replacePropertyPanel();
		replaceObjectHierarchy();

	} catch (error) {
		console.error('Failed to initialize Svelte UI components:', error);
	}
}

/**
 * Replace the vanilla JS property panel with Svelte component
 */
function replacePropertyPanel() {
	const rightPanel = document.querySelector('.right-panel');
	if (!rightPanel) {
		console.warn('Right panel not found for Svelte replacement');
		return;
	}

	// Create mount point for Svelte property panel
	const svelteMount = document.createElement('div');
	svelteMount.id = 'svelte-property-panel';
	svelteMount.className = 'h-full';

	// Replace content
	rightPanel.innerHTML = '';
	rightPanel.appendChild(svelteMount);

	// Mount Svelte component
	// Note: This would be done dynamically in a real integration
}

/**
 * Replace the vanilla JS object hierarchy with Svelte component
 */
function replaceObjectHierarchy() {
	const objectList = document.querySelector('#object-list');
	if (!objectList) {
		console.warn('Object list not found for Svelte replacement');
		return;
	}

	// Create mount point for Svelte object tree
	const svelteMount = document.createElement('div');
	svelteMount.id = 'svelte-object-tree';
	svelteMount.className = 'h-full';

	// Replace content
	objectList.innerHTML = '';
	objectList.appendChild(svelteMount);
}

/**
 * Development mode loader - for testing integration
 */
export function loadSvelteUIInDevelopment() {
	// This would load the Svelte app in an iframe or separate window for development

	// Create overlay for development
	const overlay = document.createElement('div');
	overlay.style.cssText = `
		position: fixed;
		top: 0;
		right: 0;
		width: 400px;
		height: 100vh;
		background: #1a1a1a;
		border-left: 2px solid #404040;
		z-index: 1000;
		padding: 16px;
		overflow-y: auto;
	`;

	// Add title
	const title = document.createElement('h3');
	title.textContent = 'Svelte UI Demo';
	title.style.cssText = 'color: #e0e0e0; margin-bottom: 16px; font-size: 18px;';
	overlay.appendChild(title);

	// Add iframe with Svelte UI
	const iframe = document.createElement('iframe');
	iframe.src = 'http://localhost:5173'; // SvelteKit dev server
	iframe.style.cssText = `
		width: 100%;
		height: calc(100% - 60px);
		border: none;
		border-radius: 4px;
	`;
	overlay.appendChild(iframe);

	// Add close button
	const closeButton = document.createElement('button');
	closeButton.textContent = '✕';
	closeButton.style.cssText = `
		position: absolute;
		top: 16px;
		right: 16px;
		background: #333;
		color: #e0e0e0;
		border: none;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		cursor: pointer;
	`;
	closeButton.onclick = () => document.body.removeChild(overlay);
	overlay.appendChild(closeButton);

	document.body.appendChild(overlay);
}

// Auto-initialize if in development mode
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
	// Add a button to test the integration
	document.addEventListener('DOMContentLoaded', () => {
		const button = document.createElement('button');
		button.textContent = 'Load Svelte UI Demo';
		button.style.cssText = `
			position: fixed;
			top: 10px;
			right: 10px;
			background: #4a9eff;
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			z-index: 1001;
			font-size: 12px;
		`;
		button.onclick = loadSvelteUIInDevelopment;
		document.body.appendChild(button);
	});
}