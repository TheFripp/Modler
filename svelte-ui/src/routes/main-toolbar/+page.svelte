<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { activateToolInScene, toggleSnapInScene, wrapSelectionInContainer } from '$lib/bridge/threejs-bridge';
	import { MousePointer, Move, FoldHorizontal, Box, Magnet, SquareStack, Group, Ruler } from 'lucide-svelte';

	// Main tool configuration with Lucide icons
	const tools = [
		{ id: 'select', label: 'Select', shortcut: 'Q', icon: MousePointer },
		{ id: 'move', label: 'Move', shortcut: 'W', icon: Move },
		{ id: 'push', label: 'Push', shortcut: 'E', icon: FoldHorizontal },
		{ id: 'box-creation', label: 'Create Box', shortcut: 'R', icon: Box },
		{ id: 'tile', label: 'Tile', shortcut: 'T', icon: SquareStack },
		{ id: 'measure', label: 'Measure', shortcut: 'M', icon: Ruler }
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

		// SimpleCommunication: No initialization needed - automatic postMessage handling

		// NOTE: Keyboard shortcuts are now handled by InputController in the main app
		// This eliminates duplicate event handlers and consolidates keyboard handling
		// Tool shortcuts: Q (select), W (move), E (push), R (box), T (tile)
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

		<!-- Container Action -->
		<button
			class="toolbar-btn"
			on:click={() => wrapSelectionInContainer()}
			title="Wrap in Container (⌘F)"
		>
			<Group size={22} />
		</button>

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

	<!-- Axis Gizmo - positioned next to toolbar -->
	<div class="axis-gizmo-container" id="axis-gizmo-container"></div>
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
		padding: 16px; /* Reduced padding by 8px (was 24px) */
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 12px; /* Space between toolbar and gizmo */
		background: transparent;
		min-height: 100vh;
		width: 100vw;
	}

	.floating-toolbar {
		background: #171717;
		backdrop-filter: blur(10px);
		border: 1px solid #2E2E2E;
		border-radius: 24px;
		padding: 0px 8px; /* Reduced padding by 8px all around (was 8px 16px) */
		display: flex;
		align-items: center;
		gap: 8px; /* Reduced gap for tighter square button layout */
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
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

	/* Axis Gizmo - Connected to toolbar */
	.axis-gizmo-container {
		width: 48px; /* Match toolbar button size */
		height: 48px; /* Match toolbar button size */
		background: #171717;
		border: 1px solid #2E2E2E;
		border-radius: 50%;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.axis-gizmo-container :global(canvas) {
		display: block;
	}
</style>