<script lang="ts">
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
	import type { SectionFeatures } from '$lib/services/property-section-registry';
	import { currentUnit as storeCurrentUnit } from '$lib/stores/units';

	// Props
	export let displayObject: any;
	export let objectId: string;
	export let currentUnit: string = 'm'; // Deprecated - kept for backward compatibility
	export let features: SectionFeatures = {
		position: true,
		rotation: true,
		dimensions: true
	};

	// Fill button state (dynamic based on container layout)
	let showFillButtons: boolean = false;
	let fillButtonStates = { x: false, y: false, z: false };

	// Layout mode state - determines if position inputs should be disabled
	let inLayoutMode = false;

	// Default empty values for when no object is selected
	const emptyVector = { x: 0, y: 0, z: 0 };

	// SimpleCommunication: ALL computed properties come automatically with displayObject!
	// No need to request fill button state, layout mode, etc. - StateSerializer includes everything
	$: showFillButtons = displayObject?.canHaveFillButtons || false;
	$: fillStates = displayObject?.fillButtonStates || { x: false, y: false, z: false };
	$: inLayoutMode = displayObject?.isInLayoutMode || false;

	// Disabled state when no object is selected
	$: isDisabled = !displayObject;

	// Unit label from centralized store
	$: unitLabel = $storeCurrentUnit;

	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (!displayObject) return;

		// SimpleCommunication: Direct postMessage to CommandRouter
		window.parent.postMessage({
			type: 'toggle-fill-mode',
			objectId: displayObject.id,
			axis
		}, '*');

		// Don't optimistically toggle - wait for backend confirmation
		// The backend will emit events that trigger UI updates with correct state
	}

	function handleFillHover(axis: 'x' | 'y' | 'z', isHovering: boolean = true) {
		if (!displayObject) return;

		// SimpleCommunication: Direct postMessage to CommandRouter
		window.parent.postMessage({
			type: 'button-hover',
			buttonType: 'fill',
			objectId: displayObject.id,
			axis,
			isHovering
		}, '*');
	}

	// SimpleCommunication: No message listeners needed!
	// All data (canHaveFillButtons, fillButtonStates, isInLayoutMode) comes automatically
	// with displayObject from StateSerializer. No request/response needed.
</script>

<div class="space-y-4">
	<!-- Dimensions Sub-group (optional via features.dimensions) -->
	{#if features.dimensions !== false}
		<div class="space-y-2">
			<SectionHeader label="Dimensions" unit={unitLabel} align="left" class={isDisabled ? 'opacity-30' : ''} />
			<XyzInput
				values={displayObject?.dimensions || emptyVector}
				{objectId}
				propertyBase="dimensions"
				labels={{ x: 'W', y: 'H', z: 'D' }}
				idPrefix="dim"
				{showFillButtons}
				{fillStates}
				onFillToggle={handleFillToggle}
				onFillHover={handleFillHover}
				disableAll={isDisabled}
				hideValues={isDisabled}
			/>
		</div>
	{/if}

	<!-- Rotation Sub-group (optional via features.rotation) -->
	{#if features.rotation !== false}
		<div class="space-y-2">
			<SectionHeader label="Rotation" unit="°" align="left" class={isDisabled ? 'opacity-30' : ''} />
			<XyzInput
				values={displayObject?.rotation || emptyVector}
				{objectId}
				propertyBase="rotation"
				step={1.0}
				disableAll={isDisabled}
				hideValues={isDisabled}
			/>
		</div>
	{/if}

	<!-- Position Sub-group (optional via features.position) -->
	{#if features.position !== false}
		<div class="space-y-2">
			<SectionHeader label="Position" unit={unitLabel} align="left" class={isDisabled ? 'opacity-30' : ''} />
			<XyzInput
				values={displayObject?.position || emptyVector}
				{objectId}
				propertyBase="position"
				idPrefix="pos"
				disableAll={isDisabled || inLayoutMode}
				hideValues={isDisabled}
			/>
		</div>
	{/if}
</div>
