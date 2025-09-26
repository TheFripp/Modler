<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { activateToolInScene, toggleSnapInScene } from '$lib/bridge/threejs-bridge';
	import { MousePointer, Move, ArrowUp, Box, Magnet } from 'lucide-svelte';

	// Main tool configuration with Lucide icons
	const tools = [
		{ id: 'select', label: 'Select', shortcut: 'Q', icon: MousePointer },
		{ id: 'move', label: 'Move', shortcut: 'W', icon: Move },
		{ id: 'push', label: 'Push', shortcut: 'E', icon: ArrowUp },
		{ id: 'box-creation', label: 'Create Box', shortcut: 'R', icon: Box }
	];

	function handleToolClick(toolName: string) {
		try {
			activateToolInScene(toolName);
		} catch (error) {
			console.error('❌ Tool activation failed:', error);
		}
	}

	function handleSnapToggle() {
		try {
			toggleSnapInScene();
		} catch (error) {
			console.error('❌ Snap toggle failed:', error);
		}
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');


		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();
	});
</script>

<svelte:head>
	<title>Main Toolbar</title>
</svelte:head>

<!-- Floating Main Toolbar for iframe integration -->
<div class="toolbar-container">
	<div class="floating-toolbar">
		{#each tools as tool}
			<button
				class="toolbar-btn"
				class:active={$toolState.activeTool === tool.id}
				on:click={() => handleToolClick(tool.id)}
				title="{tool.label} ({tool.shortcut})"
			>
				<svelte:component this={tool.icon} size={22} />
			</button>
		{/each}

		<!-- Separator -->
		<div class="separator"></div>

		<!-- Snap Toggle -->
		<button
			class="toolbar-btn"
			class:active={$toolState.snapEnabled}
			on:click={handleSnapToggle}
			title="Toggle Snapping {$toolState.snapEnabled ? '(On)' : '(Off)'}"
		>
			<Magnet size={22} />
		</button>
	</div>
</div>

<style>
	:global(html) {
		background: transparent !important;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		background: transparent !important;
	}

	:global(*) {
		box-sizing: border-box;
	}

	.toolbar-container {
		padding: 24px; /* Increased padding to prevent toolbar cutoff */
		display: flex;
		justify-content: center;
		background: transparent;
		min-height: 100vh;
		width: 100vw;
	}

	.floating-toolbar {
		background: #171717;
		backdrop-filter: blur(10px);
		border: 1px solid #2E2E2E;
		border-radius: 24px;
		padding: 8px 16px; /* Reduced vertical padding by 8px (was 16px) */
		display: flex;
		align-items: center;
		gap: 8px; /* Reduced gap for tighter square button layout */
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		width: fit-content;
		height: fit-content;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px; /* Increased button size */
		height: 48px; /* Increased button size */
		background: transparent; /* No background by default */
		border: none; /* No border */
		border-radius: 16px; /* Doubled from 8px */
		color: #6b7280; /* Dark grey icons matching toolbar background */
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
	}

	.toolbar-btn:hover {
		background: radial-gradient(circle 20px at center, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 100%);
		color: #ffffff; /* Bright white icon on hover */
		transform: translateY(-1px);
	}

	.toolbar-btn.active {
		background: radial-gradient(circle 20px at center, rgba(74, 158, 255, 0.2) 0%, rgba(74, 158, 255, 0) 100%);
		color: #4a9eff; /* Light blue icon for active state */
	}

	.toolbar-btn.active:hover {
		background: radial-gradient(circle 20px at center, rgba(107, 182, 255, 0.2) 0%, rgba(107, 182, 255, 0) 100%);
		color: #4a9eff; /* Keep light blue icon on active hover */
	}

	.toolbar-btn:focus {
		outline: none; /* Remove default focus outline */
	}

	.separator {
		width: 1px;
		height: 24px;
		background: #2E2E2E;
		margin: 0 4px;
	}

	/* Lucide icon styling */
	.toolbar-btn :global(svg) {
		flex-shrink: 0;
	}
</style>