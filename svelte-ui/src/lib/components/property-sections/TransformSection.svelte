<script lang="ts">
	import { onMount } from 'svelte';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
	import type { SectionFeatures } from '$lib/services/property-section-registry';

	// Props
	export let displayObject: any;
	export let objectId: string;
	export let currentUnit: string = 'm';
	export let showFillButtons: boolean = false;
	export let features: SectionFeatures = {
		position: true,
		rotation: true,
		dimensions: true
	};

	// Fill button state
	let fillButtonStates = { x: false, y: false, z: false };

	// Layout mode state - determines if position inputs should be disabled
	let inLayoutMode = false;

	// Request fill button state and layout mode when displayObject changes
	$: if (displayObject && !displayObject.isContainer && showFillButtons) {
		requestFillButtonState(displayObject.id);
		requestLayoutMode(displayObject.id);
	} else {
		inLayoutMode = false;
	}

	function requestFillButtonState(id: string) {
		window.parent.postMessage({
			type: 'fill-button-check',
			data: { objectId: id }
		}, '*');

		window.parent.postMessage({
			type: 'fill-button-get-states',
			data: { objectId: id }
		}, '*');
	}

	function requestLayoutMode(id: string) {
		window.parent.postMessage({
			type: 'check-layout-mode',
			data: { objectId: id }
		}, '*');
	}

	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (!displayObject) return;

		window.parent.postMessage({
			type: 'fill-button-toggle',
			data: { objectId: displayObject.id, axis }
		}, '*');

		fillButtonStates[axis] = !fillButtonStates[axis];

		setTimeout(() => requestFillButtonState(displayObject.id), 100);
	}

	function handleFillHover(axis: 'x' | 'y' | 'z', isHovering: boolean = true) {
		if (!displayObject) return;

		window.parent.postMessage({
			type: 'fill-button-hover',
			data: {
				objectId: displayObject.id,
				axis: axis,
				isHovering: isHovering
			}
		}, '*');
	}

	// Listen for fill button and layout mode responses
	onMount(() => {
		const handleMessageResponse = (event: MessageEvent) => {
			if (event.data.type === 'fill-button-check-response') {
				// showFillButtons controlled by parent
			} else if (event.data.type === 'fill-button-states-response') {
				fillButtonStates = event.data.data.states || { x: false, y: false, z: false };
			} else if (event.data.type === 'layout-mode-response') {
				inLayoutMode = event.data.data.inLayoutMode || false;
			}
		};

		window.addEventListener('message', handleMessageResponse);
		return () => window.removeEventListener('message', handleMessageResponse);
	});
</script>

<PropertyGroup title="Transform">
	<div class="space-y-4">
		<!-- Position Sub-group (optional via features.position) -->
		{#if features.position !== false}
			<div class="space-y-2">
				<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Position ({currentUnit})</h4>
				<XyzInput
					values={displayObject.position}
					{objectId}
					propertyBase="position"
					idPrefix="pos"
					disableAll={inLayoutMode}
				/>
			</div>
		{/if}

		<!-- Rotation Sub-group (optional via features.rotation) -->
		{#if features.rotation !== false}
			<div class="space-y-2">
				<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Rotation</h4>
				<XyzInput
					values={displayObject.rotation}
					{objectId}
					propertyBase="rotation"
				/>
			</div>
		{/if}

		<!-- Dimensions Sub-group (optional via features.dimensions) -->
		{#if features.dimensions !== false}
			<div class="space-y-2">
				<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Dimensions ({currentUnit})</h4>
				<XyzInput
					values={displayObject.dimensions}
					{objectId}
					propertyBase="dimensions"
					labels={{ x: 'W', y: 'H', z: 'D' }}
					idPrefix="dim"
					{showFillButtons}
					fillStates={fillButtonStates}
					onFillToggle={handleFillToggle}
					onFillHover={handleFillHover}
				/>
			</div>
		{/if}

		<!-- Example: Randomize feature (optional via features.randomize) -->
		{#if features.randomize}
			<div class="space-y-2">
				<button
					type="button"
					onclick={() => console.log('Randomize clicked')}
					class="w-full px-3 py-2 text-xs font-medium bg-[#2E2E2E] border border-[#404040] rounded-md text-foreground hover:bg-[#404040] transition-colors"
				>
					Randomize Transform
				</button>
			</div>
		{/if}
	</div>
</PropertyGroup>
