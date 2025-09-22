<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { activateToolInScene } from '$lib/bridge/threejs-bridge';

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
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		background: transparent;
	}

	.floating-toolbar {
		background: rgba(42, 42, 42, 0.95);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(64, 64, 64, 0.8);
		border-radius: 12px;
		padding: 8px 16px;
		height: 48px;
		display: flex;
		align-items: center;
		gap: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		width: fit-content;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #ffffff;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.toolbar-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.toolbar-btn.active {
		background: rgba(74, 144, 226, 0.8);
		border-color: rgba(74, 144, 226, 1);
		box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.3);
	}

	.toolbar-btn.active:hover {
		background: rgba(74, 144, 226, 0.9);
	}

	.tool-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.tool-label {
		font-weight: 500;
	}
</style>