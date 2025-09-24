<script lang="ts">
	import { selectedObject, selectedObjects, multiSelection, displayObject, updateThreeJSProperty, getPropertyMixedState, fieldStates } from '$lib/stores/modler';
	import { propertyController } from '$lib/services/property-controller';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import ButtonGroup from '$lib/components/ui/button-group.svelte';
	import MaterialInput from '$lib/components/ui/material-input.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import { cn } from '$lib/utils';


	// All property updates now handled by PropertyController
	// Legacy handlers removed - components use PropertyController directly

	// Get the appropriate object ID for property updates (multi-selection or single object)
	function getObjectIdForUpdate(): string {
		return $multiSelection ? 'multi-selection' : $displayObject?.id || '';
	}

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

		// If clicking the same direction that's already active, toggle off (disable layout)
		if (currentDirection === axis && isCurrentlyEnabled) {
			propertyController.updateProperty(objectId, 'autoLayout.enabled', false);
			propertyController.updateProperty(objectId, 'autoLayout.direction', '');
		} else {
			// Enable layout and set new direction
			propertyController.updateProperty(objectId, 'autoLayout.enabled', true);
			propertyController.updateProperty(objectId, 'autoLayout.direction', axis);
		}
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

	// Fill functionality for dimensions
	function shouldShowFillButtons(): boolean {
		if (!$displayObject) {
			console.log('DEBUG: No displayObject');
			return false;
		}

		if ($displayObject.isContainer) {
			console.log('DEBUG: Object is a container, no fill buttons');
			return false;
		}

		// Check if PropertyManager is available
		const hasPropertyManager = window.modlerComponents?.propertyManager;
		console.log('DEBUG: PropertyManager available:', !!hasPropertyManager);

		if (!hasPropertyManager) {
			console.log('DEBUG: PropertyManager not available');
			return false;
		}

		// Check if object is in a layout-enabled container
		const isInLayoutContainer = window.modlerComponents.propertyManager.isInLayoutContainer($displayObject.id);
		console.log('DEBUG: Object in layout container:', isInLayoutContainer);
		console.log('DEBUG: Object ID:', $displayObject.id);
		console.log('DEBUG: displayObject:', $displayObject);

		return isInLayoutContainer;
	}

	function getFillStates(): { x?: boolean; y?: boolean; z?: boolean } {
		if (!$displayObject || !window.modlerComponents?.propertyManager) return {};

		const pm = window.modlerComponents.propertyManager;
		return {
			x: pm.isAxisFilled($displayObject.id, 'x'),
			y: pm.isAxisFilled($displayObject.id, 'y'),
			z: pm.isAxisFilled($displayObject.id, 'z')
		};
	}

	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (window.modlerComponents?.propertyManager) {
			window.modlerComponents.propertyManager.toggleFillProperty(axis);
		}
	}

	function handleFillHover(axis: 'x' | 'y' | 'z' | null) {
		// Trigger face highlighting via VisualEffects
		const visualEffects = window.modlerComponents?.visualEffects;
		if (!visualEffects) return;

		if (axis) {
			visualEffects.showAxisFaceHighlight(axis);
		} else {
			visualEffects.clearHighlight();
		}
	}
</script>

<div class="property-panel h-full bg-[#171717] border-l border-[#2E2E2E] p-4 overflow-y-auto">

	{#if $displayObject}
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
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Position</h4>
					<XyzInput
						values={$displayObject.position}
						objectId={$displayObject.id}
						propertyBase="position"
					/>
				</div>

				<!-- Rotation Sub-group -->
				<div class="space-y-2">
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Rotation</h4>
					<XyzInput
						values={$displayObject.rotation}
						objectId={$displayObject.id}
						propertyBase="rotation"
					/>
				</div>

				<!-- Dimensions Sub-group -->
				<div class="space-y-2">
					<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Dimensions</h4>
					<XyzInput
						values={$displayObject.dimensions}
						objectId={$displayObject.id}
						propertyBase="dimensions"
						labels={{ x: 'W', y: 'H', z: 'D' }}
						showFillButtons={shouldShowFillButtons()}
						fillStates={getFillStates()}
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
						<label class="block text-sm font-medium text-muted-foreground">Layout Direction</label>

						<!-- All three buttons on same row -->
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => selectLayoutAxis('x')}
								class="px-3 py-2 text-xs border border-[#2E2E2E] rounded-md hover:bg-[#212121] transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'x' ? 'bg-[#212121] text-white border-[#2E2E2E]' : 'bg-[#171717]'}"
							>
								Width (X)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('y')}
								class="px-3 py-2 text-xs border border-[#2E2E2E] rounded-md hover:bg-[#212121] transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'y' ? 'bg-[#212121] text-white border-[#2E2E2E]' : 'bg-[#171717]'}"
							>
								Height (Y)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('z')}
								class="px-3 py-2 text-xs border border-[#2E2E2E] rounded-md hover:bg-[#212121] transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'z' ? 'bg-[#212121] text-white border-[#2E2E2E]' : 'bg-[#171717]'}"
							>
								Depth (Z)
							</button>
						</div>
					</div>


					<!-- Gap Control -->
					{#if $displayObject.autoLayout?.enabled}
						{@const gapMixed = getMixedValue('autoLayout.gap')}
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Gap</h4>
							<InlineInput
								label="Gap"
								type="number"
								value={gapMixed.displayValue}
								placeholder={gapMixed.placeholder}
								objectId={getObjectIdForUpdate()}
								property="autoLayout.gap"
								class={gapMixed.class}
							/>
						</div>

						<!-- Padding Controls -->
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Padding</h4>
							<div class="grid grid-cols-2 gap-2">
								{#each ['top', 'bottom', 'left', 'right', 'front', 'back'] as side}
									{@const paddingMixed = getMixedValue(`autoLayout.padding.${side}`)}
									<InlineInput
										label={side.charAt(0).toUpperCase() + side.slice(1)}
										type="number"
										value={paddingMixed.displayValue}
										placeholder={paddingMixed.placeholder}
										objectId={getObjectIdForUpdate()}
										property={`autoLayout.padding.${side}`}
										class={paddingMixed.class}
									/>
								{/each}
							</div>
						</div>
					{/if}

					<div class="text-xs text-muted-foreground italic">
						{$displayObject.autoLayout?.enabled
							? `Layout active: ${$displayObject.autoLayout.direction?.toUpperCase()} axis`
							: 'No layout active - container in hug mode'
						}
					</div>
				</div>
			</PropertyGroup>
		{/if}
	{:else}
		<div class="text-center text-muted-foreground py-8">
			<div class="text-lg mb-2">No object selected</div>
			<div class="text-sm">Select an object to view its properties</div>
		</div>
	{/if}
</div>