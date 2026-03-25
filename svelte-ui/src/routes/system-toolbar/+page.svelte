<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { toolState } from '$lib/stores/modler';
	import { toggleSnapInScene } from '$lib/bridge/threejs-bridge';
	import { currentUnit } from '$lib/stores/units';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import { cn } from '$lib/utils';

	let showSettings = false;

	// CAD wireframe settings
	let cadWireframeSettings = {
		color: '#666666',
		opacity: 0.5,
		lineWidth: 1
	};

	const units = [
		{ value: 'm', label: 'Meters (m)' },
		{ value: 'cm', label: 'Centimeters (cm)' },
		{ value: 'mm', label: 'Millimeters (mm)' },
		{ value: 'in', label: 'Inches (in)' },
		{ value: 'ft', label: 'Feet (ft)' }
	];

	function handleSnapToggle() {
		try {
			toggleSnapInScene();
		} catch (error) {
			console.error('❌ Snap toggle failed:', error);
		}
	}

	function toggleSettings() {
		showSettings = !showSettings;
	}

	function selectUnit(unit: string) {
		currentUnit.set(unit as any);
		// Route through main window so all iframes get notified
		if (window.parent && window.parent !== window) {
			window.parent.postMessage({ type: 'unit-settings-changed', settings: { 'unit.current': unit } }, '*');
		}
		showSettings = false;
	}

	function updateCadWireframeSettings(property: string, value: any) {
		cadWireframeSettings[property] = value;

		// Map property to proper config path
		const configPath = `visual.cad.wireframe.${property}`;

		// Send individual setting update through unified communication system
		const settings = {
			[configPath]: value
		};

		if (window.parent && window.parent !== window) {
			window.parent.postMessage({ type: 'cad-wireframe-settings-changed', settings }, '*');
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.settings-dropdown') && !target.closest('.settings-btn')) {
			showSettings = false;
		}
	}

	onMount(() => {
		// Enable dark mode to match PropertyPanel theme
		document.documentElement.classList.add('dark');
		document.body.classList.add('dark');

		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();

		// Initialize CAD wireframe settings from main window
		if (window !== window.parent) {
			window.parent.postMessage({ type: 'get-cad-wireframe-settings' }, '*');

			// Listen for settings responses
			const handleMessage = (event: MessageEvent) => {
				if (event.data.type === 'cad-wireframe-settings-response') {
					cadWireframeSettings = event.data.settings;
				}
			};

			window.addEventListener('message', handleMessage);

			// Cleanup message listener
			const cleanup = () => {
				window.removeEventListener('message', handleMessage);
				document.removeEventListener('click', handleClickOutside);
			};

			return cleanup;
		}

		// Add click outside listener
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<svelte:head>
	<title>System Toolbar</title>
</svelte:head>

<!-- Floating System Toolbar for iframe integration -->
<div class="bg-card border border-border rounded-xl p-3 h-12 flex items-center gap-3 shadow-lg backdrop-blur-sm w-fit mx-4">
	<button
		class={cn(
			"flex items-center gap-2 px-3 py-1.5 bg-input border border-border rounded-lg text-foreground text-xs font-medium cursor-pointer transition-all hover:bg-accent hover:border-muted-foreground/40 hover:-translate-y-0.5",
			$toolState.snapEnabled && "border-primary shadow-sm"
		)}
		on:click={handleSnapToggle}
		title="Toggle Snapping {$toolState.snapEnabled ? '(On)' : '(Off)'}"
	>
		<span class="text-sm">🧲</span>
	</button>

	<!-- Settings Button with Dropdown -->
	<div class="relative">
		<button
			class={cn(
				"flex items-center gap-2 px-3 py-1.5 bg-input border border-border rounded-lg text-foreground text-xs font-medium cursor-pointer transition-all hover:bg-accent hover:border-muted-foreground/40 hover:-translate-y-0.5",
				showSettings && "border-primary shadow-sm"
			)}
			on:click={toggleSettings}
			title="Settings"
		>
			<span class="text-sm">⚙️</span>
		</button>

		{#if showSettings}
			<div class="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg min-w-52 shadow-lg z-50 overflow-hidden">

				<PropertyGroup title="Units" class="p-4 pb-2">
					<div class="space-y-1">
						{#each units as unit}
							<button
								class={cn(
									"w-full flex items-center justify-between px-3 py-2 text-xs text-left cursor-pointer transition-colors rounded-md",
									$currentUnit === unit.value
										? "bg-secondary text-primary"
										: "text-foreground hover:bg-accent"
								)}
								on:click={() => selectUnit(unit.value)}
							>
								{unit.label}
								{#if $currentUnit === unit.value}
									<span class="text-xs text-primary">✓</span>
								{/if}
							</button>
						{/each}
					</div>
				</PropertyGroup>

				<div class="border-t border-border"></div>

				<PropertyGroup title="CAD Wireframes" class="p-4 pt-2">
					<div class="space-y-3">
						<!-- Color Setting -->
						<div class="flex items-center justify-between gap-3">
							<label class="text-xs font-medium text-foreground min-w-12">Color</label>
							<input
								type="color"
								bind:value={cadWireframeSettings.color}
								on:change={() => updateCadWireframeSettings('color', cadWireframeSettings.color)}
								class="w-10 h-6 rounded border border-border bg-transparent cursor-pointer"
							/>
						</div>

						<!-- Opacity Setting -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-xs font-medium text-foreground">Opacity</label>
								<span class="text-xs text-muted-foreground">{Math.round(cadWireframeSettings.opacity * 100)}%</span>
							</div>
							<input
								type="range"
								min="0.1"
								max="1"
								step="0.1"
								bind:value={cadWireframeSettings.opacity}
								on:input={() => updateCadWireframeSettings('opacity', cadWireframeSettings.opacity)}
								class="w-full h-1 bg-muted rounded appearance-none cursor-pointer
									[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
									[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
							/>
						</div>

						<!-- Line Width Setting -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-xs font-medium text-foreground">Thickness</label>
								<span class="text-xs text-muted-foreground">{cadWireframeSettings.lineWidth}px</span>
							</div>
							<input
								type="range"
								min="1"
								max="5"
								step="1"
								bind:value={cadWireframeSettings.lineWidth}
								on:input={() => updateCadWireframeSettings('lineWidth', cadWireframeSettings.lineWidth)}
								class="w-full h-1 bg-muted rounded appearance-none cursor-pointer
									[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
									[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
							/>
						</div>
					</div>
				</PropertyGroup>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		background: transparent;
	}
</style>