<script lang="ts">
	import { selectedObject, selectedObjects, multiSelection, displayObject, updateThreeJSProperty, getPropertyMixedState, fieldStates } from '$lib/stores/modler';
	import { propertyController } from '$lib/services/property-controller';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
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
</script>

<div class="property-panel h-full bg-card border-l border-[#242424] p-4 overflow-y-auto">

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
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-600 transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'x' ? 'bg-gray-600 text-white border-gray-500' : ''}"
							>
								Width (X)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('y')}
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-600 transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'y' ? 'bg-gray-600 text-white border-gray-500' : ''}"
							>
								Height (Y)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('z')}
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-600 transition-colors {$displayObject.autoLayout?.enabled && $displayObject.autoLayout?.direction === 'z' ? 'bg-gray-600 text-white border-gray-500' : ''}"
							>
								Depth (Z)
							</button>
						</div>
					</div>


					<!-- Gap Control -->
					{#if $displayObject.autoLayout?.enabled}
						{@const gapMixed = getMixedValue('autoLayout.gap')}
						<div class="space-y-2">
							<label class="text-xs font-medium text-foreground">Gap</label>
							<input
								type="number"
								value={gapMixed.displayValue}
								placeholder={gapMixed.placeholder}
								onblur={(e) => propertyController.updateProperty(getObjectIdForUpdate(), 'autoLayout.gap', parseFloat(e.target.value) || 0)}
								class="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded {gapMixed.class}"
								step="0.1"
								min="0"
							/>
						</div>

						<!-- Padding Controls -->
						<div class="space-y-2">
							<label class="text-xs font-medium text-foreground">Padding</label>
							<div class="grid grid-cols-2 gap-2">
								{#each ['top', 'bottom', 'left', 'right', 'front', 'back'] as side}
									{@const paddingMixed = getMixedValue(`autoLayout.padding.${side}`)}
									<div>
										<label class="text-xs text-muted-foreground">{side.charAt(0).toUpperCase() + side.slice(1)}</label>
										<input
											type="number"
											value={paddingMixed.displayValue}
											placeholder={paddingMixed.placeholder}
											onblur={(e) => propertyController.updateProperty(getObjectIdForUpdate(), `autoLayout.padding.${side}`, parseFloat(e.target.value) || 0)}
											class="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded {paddingMixed.class}"
											step="0.1"
											min="0"
										/>
									</div>
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