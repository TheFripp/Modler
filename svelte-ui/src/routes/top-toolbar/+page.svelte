<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { activateToolInScene, toggleSnapInScene } from '$lib/bridge/threejs-bridge';

	// Tool configuration
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
	<title>Modler Toolbar</title>
</svelte:head>

<!-- Top Toolbar for iframe integration -->
<div class="top-toolbar w-full h-16 bg-card border-b border-border flex items-center justify-center px-4">
	<!-- Main Tools Section -->
	<div class="flex items-center gap-2">
		{#each tools as tool}
			<button
				class="toolbar-btn flex items-center gap-2 px-3 py-2 text-sm rounded border transition-colors"
				class:active={$toolState.activeTool === tool.id}
				on:click={() => handleToolClick(tool.id)}
				title="{tool.label} ({tool.shortcut})"
			>
				<span class="tool-icon text-base">{tool.icon}</span>
				<span class="tool-label font-medium">{tool.label}</span>
			</button>
		{/each}

		<!-- Separator -->
		<div class="w-px h-6 bg-border mx-2"></div>

		<!-- System Tools -->
		<button
			class="toolbar-btn flex items-center gap-2 px-3 py-2 text-sm rounded border transition-colors"
			class:active={$toolState.snapEnabled}
			on:click={handleSnapToggle}
			title="Toggle Snapping"
		>
			<span class="tool-icon text-base">🧲</span>
			<span class="tool-label font-medium">Snap: {$toolState.snapEnabled ? 'On' : 'Off'}</span>
		</button>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.toolbar-btn {
		@apply bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground;
	}

	.toolbar-btn.active {
		@apply bg-primary text-primary-foreground border-primary;
	}

	.toolbar-btn.active:hover {
		@apply bg-primary/90;
	}

	.tool-icon {
		@apply flex-shrink-0;
	}

	.tool-label {
		@apply whitespace-nowrap;
	}
</style>