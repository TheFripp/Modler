<script lang="ts">
	import { onMount } from 'svelte';
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
</script>

<div class="toolbar-container bg-card border border-border rounded-md p-2">
	<!-- Tool Section -->
	<div class="toolbar-section mb-3">
		<h3 class="text-xs font-medium text-muted-foreground mb-2">Tools</h3>
		<div class="grid grid-cols-2 gap-1">
			{#each tools as tool}
				<button
					class="tool-button flex items-center gap-2 px-2 py-1.5 text-xs rounded border transition-colors"
					class:active={$toolState.activeTool === tool.id}
					on:click={() => handleToolClick(tool.id)}
					title="{tool.label} ({tool.shortcut})"
				>
					<span class="tool-icon">{tool.icon}</span>
					<span class="tool-label">{tool.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- System Section -->
	<div class="toolbar-section">
		<h3 class="text-xs font-medium text-muted-foreground mb-2">System</h3>
		<button
			class="tool-button flex items-center gap-2 px-2 py-1.5 text-xs rounded border transition-colors w-full"
			class:active={$toolState.snapEnabled}
			on:click={handleSnapToggle}
			title="Toggle Snapping"
		>
			<span class="tool-icon">🧲</span>
			<span class="tool-label">Snap: {$toolState.snapEnabled ? 'On' : 'Off'}</span>
		</button>
	</div>

	<!-- Debug Info -->
	<div class="toolbar-section mt-3 pt-2 border-t border-border">
		<div class="text-xs text-muted-foreground space-y-1">
			<div>Tool: {$toolState.activeTool}</div>
			<div>Snap: {$toolState.snapEnabled ? 'Enabled' : 'Disabled'}</div>
		</div>
	</div>
</div>

<style>
	.tool-button {
		@apply bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground;
	}

	.tool-button.active {
		@apply bg-primary text-primary-foreground border-primary;
	}

	.tool-button.active:hover {
		@apply bg-primary/90;
	}

	.tool-icon {
		@apply text-sm;
	}

	.tool-label {
		@apply font-medium;
	}
</style>