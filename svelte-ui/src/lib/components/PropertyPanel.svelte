<script lang="ts">
	import { onMount } from 'svelte';
	import { selectedObject, selectedObjects, multiSelection, displayObject, updateThreeJSProperty, getPropertyMixedState, fieldStates } from '$lib/stores/modler';
	import { propertyController } from '$lib/services/property-controller';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import ButtonGroup from '$lib/components/ui/button-group.svelte';
	import MaterialInput from '$lib/components/ui/material-input.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import { cn } from '$lib/utils';

	// Unit system state
	let currentUnit = 'm';
	let unitConverter: any = null;

	// Update current unit from UnitConverter or unit change events
	function updateCurrentUnit() {
		if (unitConverter) {
			currentUnit = unitConverter.userUnit;
		}
	}


	// All property updates now handled by PropertyController
	// Legacy handlers removed - components use PropertyController directly

	// Get the appropriate object ID for property updates (multi-selection or single object)
	function getObjectIdForUpdate(): string {
		return $multiSelection ? 'multi-selection' : $displayObject?.id || '';
	}

	// Reactive layout button states
	$: isLayoutEnabled = $displayObject?.autoLayout?.enabled ?? false;
	$: layoutDirection = $displayObject?.autoLayout?.direction ?? '';
	$: isXActive = isLayoutEnabled && layoutDirection === 'x';
	$: isYActive = isLayoutEnabled && layoutDirection === 'y';
	$: isZActive = isLayoutEnabled && layoutDirection === 'z';

	// Reactive gap value
	$: gapValue = $displayObject?.calculatedGap !== undefined
		? $displayObject.calculatedGap
		: ($displayObject?.autoLayout?.gap ?? 0);

	// Handle layout axis selection with toggle behavior
	function selectLayoutAxis(axis: string) {
		if (!$displayObject?.isContainer) return;
		if (!axis || !['x', 'y', 'z'].includes(axis)) {
			console.error('❌ Invalid layout axis:', axis);
			return;
		}

		const objectId = getObjectIdForUpdate();
		const currentDirection = $displayObject.autoLayout?.direction;
		const isCurrentlyEnabled = $displayObject.autoLayout?.enabled;

		// Build complete autoLayout object
		const autoLayout = {
			enabled: !(currentDirection === axis && isCurrentlyEnabled),
			direction: (currentDirection === axis && isCurrentlyEnabled) ? '' : axis,
			gap: $displayObject.autoLayout?.gap ?? 0,
			padding: $displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			}
		};

		// Send update to main window - synchronous propagation will update UI immediately
		// No optimistic update needed - the roundtrip should be fast enough
		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Mixed value helpers for individual inputs
	function getMixedValue(property: string): { value: any; isMixed: boolean; displayValue: string; placeholder: string; class: string } {
		const mixedState = getPropertyMixedState(property, $selectedObjects);
		const numericValue = typeof mixedState.value === 'number' ? Math.round(mixedState.value * 10) / 10 : (mixedState.value || 0);
		return {
			value: mixedState.value,
			isMixed: mixedState.isMixed,
			displayValue: mixedState.isMixed ? '' : String(numericValue),
			placeholder: mixedState.isMixed ? 'Mixed' : '',
			class: mixedState.isMixed ? 'text-muted-foreground/60' : ''
		};
	}

	// Fill button state
	let showFillButtons = false;
	let fillButtonStates = { x: false, y: false, z: false };

	// Layout mode state - determines if position inputs should be disabled
	let inLayoutMode = false;

	// Request fill button state and layout mode via PostMessage when displayObject changes
	$: if ($displayObject && !$displayObject.isContainer) {
		requestFillButtonState($displayObject.id);
		requestLayoutMode($displayObject.id);
	} else {
		showFillButtons = false;
		inLayoutMode = false;
	}

	function requestFillButtonState(objectId: string) {
		// Send request to parent window via PostMessage
		window.parent.postMessage({
			type: 'fill-button-check',
			data: { objectId }
		}, '*');

		window.parent.postMessage({
			type: 'fill-button-get-states',
			data: { objectId }
		}, '*');
	}

	function requestLayoutMode(objectId: string) {
		// Send request to parent window via PostMessage
		window.parent.postMessage({
			type: 'check-layout-mode',
			data: { objectId }
		}, '*');
	}

	// Listen for fill button and layout mode responses
	onMount(() => {
		const handleMessageResponse = (event: MessageEvent) => {
			if (event.data.type === 'fill-button-check-response') {
				showFillButtons = event.data.data.shouldShow;
			} else if (event.data.type === 'fill-button-states-response') {
				fillButtonStates = event.data.data.states || { x: false, y: false, z: false };
			} else if (event.data.type === 'layout-mode-response') {
				inLayoutMode = event.data.data.inLayoutMode || false;
			}
		};

		window.addEventListener('message', handleMessageResponse);
		return () => window.removeEventListener('message', handleMessageResponse);
	});

	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (!$displayObject) return;

		// Send toggle request via PostMessage
		window.parent.postMessage({
			type: 'fill-button-toggle',
			data: { objectId: $displayObject.id, axis }
		}, '*');

		// Optimistically update local state
		fillButtonStates[axis] = !fillButtonStates[axis];

		// Request fresh state after a short delay
		setTimeout(() => requestFillButtonState($displayObject.id), 100);
	}

	function handleFillHover(axis: 'x' | 'y' | 'z' | null) {
		// TODO: Implement face highlighting via PostMessage if needed
		// For now, just skip hover effects
	}

	// Initialize unit system on mount
	onMount(() => {
		// Get unit converter instance
		unitConverter = typeof window !== 'undefined' && window.UnitConverter ? new UnitConverter() : null;
		updateCurrentUnit();

		// Listen for unit changes from settings
		if (typeof window !== 'undefined') {
			window.addEventListener('unit-changed', updateCurrentUnit);

			return () => {
				window.removeEventListener('unit-changed', updateCurrentUnit);
			};
		}
	});
</script>

<div class="property-panel h-full bg-[#171717] border-l border-[#2E2E2E] p-4 overflow-y-auto">

	{#if $displayObject}
		{#key $displayObject.id}
		<!-- Object Name and Type -->
		<div class="flex items-center justify-between mb-6">
			<h3 class="text-lg font-semibold text-foreground">{$displayObject.name}</h3>
			<div class="flex items-center gap-2">
				{#if $displayObject.isContainer}
					<Badge variant="outline">
						Container
					</Badge>
				{:else if $displayObject.type === 'multi'}
					<Badge variant="secondary">
						Mixed
					</Badge>
				{:else if $displayObject.type === 'mixed'}
					<Badge variant="secondary">
						Mixed Types
					</Badge>
				{:else}
					<Badge variant="secondary">
						{$displayObject.type}
					</Badge>
				{/if}
			</div>
		</div>

		<!-- Transform Section -->
		<PropertyGroup title="Transform">
			<div class="space-y-4">
				<!-- Position Sub-group -->
				<div class="space-y-2">
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Position ({currentUnit})</h4>
					<XyzInput
						values={$displayObject.position}
						objectId={$displayObject.id}
						propertyBase="position"
						idPrefix="pos"
						disableAll={inLayoutMode}
					/>
				</div>

				<!-- Rotation Sub-group -->
				<div class="space-y-2">
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Rotation</h4>
					<XyzInput
						values={$displayObject.rotation}
						objectId={$displayObject.id}
						propertyBase="rotation"
					/>
				</div>

				<!-- Dimensions Sub-group -->
				<div class="space-y-2">
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Dimensions ({currentUnit})</h4>
					<XyzInput
						values={$displayObject.dimensions}
						objectId={$displayObject.id}
						propertyBase="dimensions"
						labels={{ x: 'W', y: 'H', z: 'D' }}
						idPrefix="dim"
						showFillButtons={showFillButtons}
						fillStates={fillButtonStates}
						onFillToggle={handleFillToggle}
						onFillHover={handleFillHover}
					/>
				</div>
			</div>
		</PropertyGroup>

		<!-- Material Section (only for non-containers) -->
		{#if !$displayObject.isContainer && $displayObject.material}
			<PropertyGroup title="Material">
				<MaterialInput
					color={$displayObject.material.color}
					opacity={$displayObject.material.opacity}
					objectId={$displayObject.id}
				/>
			</PropertyGroup>
		{/if}

		<!-- Container Layout Section -->
		{#if $displayObject.isContainer}
			<PropertyGroup title="Layout">
				<div class="space-y-4">
					<!-- Layout Direction (Custom Layout) -->
					<div class="space-y-2">
						<label class="block text-sm font-medium text-muted-foreground">
							Layout Direction
							{#if !isLayoutEnabled}
								<span class="text-[10px] text-muted-foreground/60">(off)</span>
							{/if}
						</label>

						<!-- All three buttons on same row -->
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => selectLayoutAxis('x')}
								class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isXActive ? 'border-[#10B981] text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
							>
								Width
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('y')}
								class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isYActive ? 'border-[#10B981] text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
							>
								Height
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('z')}
								class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isZActive ? 'border-[#10B981] text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
							>
								Depth
							</button>
						</div>
					</div>


					<!-- Gap and Padding Controls - Always show for containers -->
					<div class="space-y-2">
						<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">
							Gap
							{#if $displayObject.calculatedGap !== undefined}
								<span class="text-muted-foreground text-[10px]">(auto)</span>
							{/if}
						</h4>
						<InlineInput
							label="Gap"
							type="number"
							value={gapValue}
							objectId={getObjectIdForUpdate()}
							property="autoLayout.gap"
							min={0}
							step={0.1}
						/>
					</div>

					<!-- Padding Controls -->
					<div class="space-y-2">
						<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Padding</h4>
						<div class="grid grid-cols-3 gap-2">
							<InlineInput
								label="W"
								type="number"
								value={$displayObject.autoLayout?.padding?.width ?? 0}
								objectId={getObjectIdForUpdate()}
								property="autoLayout.padding.width"
								min={0}
								step={0.1}
							/>
							<InlineInput
								label="H"
								type="number"
								value={$displayObject.autoLayout?.padding?.height ?? 0}
								objectId={getObjectIdForUpdate()}
								property="autoLayout.padding.height"
								min={0}
								step={0.1}
							/>
							<InlineInput
								label="D"
								type="number"
								value={$displayObject.autoLayout?.padding?.depth ?? 0}
								objectId={getObjectIdForUpdate()}
								property="autoLayout.padding.depth"
								min={0}
								step={0.1}
							/>
						</div>
					</div>

					<div class="text-xs text-muted-foreground italic">
						{$displayObject.autoLayout?.enabled
							? `Layout active: ${$displayObject.autoLayout.direction?.toUpperCase()} axis`
							: 'No layout active - container in hug mode'
						}
					</div>
				</div>
			</PropertyGroup>
		{/if}
		{/key}
	{:else}
		<div class="text-center text-muted-foreground py-8">
			<div class="text-lg mb-2">No object selected</div>
			<div class="text-sm">Select an object to view its properties</div>
		</div>
	{/if}
</div>