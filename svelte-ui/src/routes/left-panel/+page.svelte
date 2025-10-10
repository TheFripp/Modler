<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import ObjectTree from '$lib/components/ObjectTree.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';

	// Tab state
	let activeTab: 'objects' | 'settings' = 'objects';
	let settingsPanel: SettingsPanel;

	// Reload settings when switching to settings tab
	$: if (activeTab === 'settings' && settingsPanel) {
		settingsPanel.reload();
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();

		// Notify main app that left panel is ready to receive data
		window.parent.postMessage({ type: 'left-panel-ready' }, '*');
	});
</script>

<!-- Standalone Left Panel for iframe integration -->
<div class="h-screen w-full flex flex-col bg-[#171717] text-foreground overflow-hidden">
	<!-- Horizontal Tabs -->
	<div class="flex border-b border-[#2E2E2E] shrink-0">
		<button
			type="button"
			onclick={() => (activeTab = 'objects')}
			class="flex-1 px-8 py-6 modler-section-title transition-colors {activeTab === 'objects'
				? 'text-foreground border-b-2 border-blue-500'
				: 'text-foreground/60 hover:text-foreground/80'}"
		>
			Objects
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'settings')}
			class="flex-1 px-8 py-6 modler-section-title transition-colors {activeTab === 'settings'
				? 'text-foreground border-b-2 border-blue-500'
				: 'text-foreground/60 hover:text-foreground/80'}"
		>
			Settings
		</button>
	</div>

	<!-- Tab Content -->
	<div class="flex-1 overflow-hidden">
		{#if activeTab === 'objects'}
			<ObjectTree />
		{:else}
			<SettingsPanel bind:this={settingsPanel} />
		{/if}
	</div>
</div>
