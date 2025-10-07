<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		// Global keyboard handler to prevent browser shortcuts and forward app shortcuts
		const handleKeyDown = (event: KeyboardEvent) => {
			// Handle Cmd/Ctrl shortcuts
			if (event.metaKey || event.ctrlKey) {
				// Cmd+F: Prevent browser find, forward to main window to wrap selected objects in container
				if (event.code === 'KeyF') {
					event.preventDefault();
					event.stopPropagation();
					if (window.parent && window.parent !== window) {
						window.parent.postMessage({
							type: 'create-layout-container',
							data: {}
						}, '*');
					}
					return;
				}

				// Cmd+Z: Undo
				if (event.code === 'KeyZ' && !event.shiftKey) {
					event.preventDefault();
					event.stopPropagation();
					if (window.parent && window.parent !== window) {
						window.parent.postMessage({
							type: 'undo',
							data: {}
						}, '*');
					}
					return;
				}

				// Cmd+Shift+Z or Cmd+Y: Redo
				if ((event.code === 'KeyZ' && event.shiftKey) || event.code === 'KeyY') {
					event.preventDefault();
					event.stopPropagation();
					if (window.parent && window.parent !== window) {
						window.parent.postMessage({
							type: 'redo',
							data: {}
						}, '*');
					}
					return;
				}

				// Cmd+D: Duplicate selected object
				if (event.code === 'KeyD') {
					event.preventDefault();
					event.stopPropagation();
					if (window.parent && window.parent !== window) {
						window.parent.postMessage({
							type: 'duplicate-object',
							data: {}
						}, '*');
					}
					return;
				}
				return; // Don't process other Cmd/Ctrl shortcuts
			}

			// Handle tool shortcuts (no modifier keys)
			const toolShortcuts: { [key: string]: string } = {
				'KeyQ': 'select',
				'KeyW': 'move',
				'KeyE': 'push',
				'KeyR': 'box-creation',
				'KeyT': 'tile'
			};

			if (toolShortcuts[event.code]) {
				event.preventDefault();
				event.stopPropagation();
				if (window.parent && window.parent !== window) {
					window.parent.postMessage({
						type: 'tool-switch',
						data: { toolName: toolShortcuts[event.code] }
					}, '*');
				}
				return;
			}

			// Escape: Clear selection
			if (event.code === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				if (window.parent && window.parent !== window) {
					window.parent.postMessage({
						type: 'clear-selection',
						data: {}
					}, '*');
				}
				return;
			}
		};

		// Use capture phase to intercept before bubbling to child elements
		window.addEventListener('keydown', handleKeyDown, true);

		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Modler V2 - Svelte UI</title>
</svelte:head>

{@render children?.()}
