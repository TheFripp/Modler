<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { activateToolInScene, toggleSnapInScene } from '$lib/bridge/threejs-bridge';

	// Main tool configuration
	const tools = [
		{ id: 'select', label: 'Select', shortcut: 'Q', icon: '🎯' },
		{ id: 'move', label: 'Move', shortcut: 'W', icon: '↕' },
		{ id: 'push', label: 'Push', shortcut: 'E', icon: '📏' },
		{ id: 'box-creation', label: 'Create Box', shortcut: 'T', icon: '📦' }
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
<div class="floating-toolbar">
	{#each tools as tool}
		<button
			class="toolbar-btn"
			class:active={$toolState.activeTool === tool.id}
			on:click={() => handleToolClick(tool.id)}
			title="{tool.label} ({tool.shortcut})"
		>
			<span class="tool-icon">{tool.icon}</span>
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
		<span class="tool-icon">🧲</span>
	</button>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		background: transparent;
	}

	.floating-toolbar {
		background: #171717;
		backdrop-filter: blur(10px);
		border: 1px solid #2E2E2E;
		border-radius: 12px;
		padding: 20px 16px; /* Increased from 12px to 20px for 8px more top/bottom padding */
		height: 48px;
		display: flex;
		align-items: center;
		gap: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		width: fit-content;
		margin: 0 16px;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: transparent; /* Removed fill color */
		border: none; /* Removed border for non-active */
		border-radius: 8px;
		color: #ffffff;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.toolbar-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-1px);
	}

	.toolbar-btn.active {
		background: transparent;
		border: 1px solid #4a9eff; /* Only active buttons have border */
		box-shadow: none;
	}

	.toolbar-btn.active:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #6bb6ff;
	}

	.separator {
		width: 1px;
		height: 24px;
		background: #2E2E2E;
		margin: 0 4px;
	}

	.tool-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.tool-label {
		font-weight: 500;
	}
</style>