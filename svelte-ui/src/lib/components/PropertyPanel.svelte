<script lang="ts">
	import { selectedObject, selectedObjects, multiSelection, displayObject, updateThreeJSProperty, getPropertyMixedState } from '$lib/stores/modler';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import XyzInput from '$lib/components/ui/xyz-input.svelte';
	import ButtonGroup from '$lib/components/ui/button-group.svelte';
	import MaterialInput from '$lib/components/ui/material-input.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import { cn } from '$lib/utils';


	// All property updates now handled by PropertyController
	// Legacy handlers removed - components use PropertyController directly

	// Handle layout axis selection
	function selectLayoutAxis(axis: string) {
		if (!$displayObject?.isContainer) return;

		// Update the autoLayout direction property
		updateThreeJSProperty($displayObject.id, 'autoLayout.direction', axis);

		// If auto layout is not enabled, enable it when direction is set
		if (!$displayObject.autoLayout?.enabled) {
			updateThreeJSProperty($displayObject.id, 'autoLayout.enabled', true);
		}
	}

	// Handle sizing mode change
	function setSizingMode(mode: 'hug' | 'fixed') {
		if (!$displayObject?.isContainer) return;
		updateThreeJSProperty($displayObject.id, 'sizingMode', mode);
	}

	// Mixed value helpers for individual inputs
	function getMixedValue(property: string): { value: any; isMixed: boolean; displayValue: string; class: string } {
		const mixedState = getPropertyMixedState(property);
		return {
			value: mixedState.value,
			isMixed: mixedState.isMixed,
			displayValue: mixedState.isMixed ? 'Mix' : String(mixedState.value || 0),
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
				<XyzInput
					label="Position"
					values={$displayObject.position}
					objectId={$displayObject.id}
					propertyBase="position"
				/>

				<XyzInput
					label="Rotation"
					values={$displayObject.rotation}
					objectId={$displayObject.id}
					propertyBase="rotation"
				/>

				<XyzInput
					label="Dimensions"
					values={$displayObject.dimensions}
					objectId={$displayObject.id}
					propertyBase="dimensions"
					labels={{ x: 'W', y: 'H', z: 'D' }}
				/>
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
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-800 transition-colors {$displayObject.autoLayout?.direction === 'x' ? 'bg-blue-600 text-white border-blue-600' : ''}"
							>
								Width (X)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('y')}
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-800 transition-colors {$displayObject.autoLayout?.direction === 'y' ? 'bg-blue-600 text-white border-blue-600' : ''}"
							>
								Height (Y)
							</button>
							<button
								type="button"
								onclick={() => selectLayoutAxis('z')}
								class="px-3 py-2 text-xs border border-gray-600 rounded-md hover:bg-gray-800 transition-colors {$displayObject.autoLayout?.direction === 'z' ? 'bg-blue-600 text-white border-blue-600' : ''}"
							>
								Depth (Z)
							</button>
						</div>
					</div>

					<ButtonGroup
						label="Container Sizing"
						options={[
							{ value: 'hug', label: 'Hug Contents' },
							{ value: 'fixed', label: 'Fixed Size' }
						]}
						value={$displayObject.sizingMode || 'fixed'}
						onSelect={setSizingMode}
						columns={2}
					/>

					<!-- Auto Layout Toggle -->
					<div class="space-y-2">
						<label class="text-xs font-medium text-foreground">Auto Layout</label>
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={$displayObject.autoLayout?.enabled || false}
								onchange={(e) => updateThreeJSProperty($displayObject.id, 'autoLayout.enabled', e.target.checked)}
								class="rounded border border-gray-600 bg-gray-800"
							/>
							<span class="text-xs text-muted-foreground">
								{$displayObject.autoLayout?.enabled ? 'Enabled' : 'Disabled'}
							</span>
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
								placeholder={gapMixed.isMixed ? 'Mix' : ''}
								oninput={(e) => updateThreeJSProperty($displayObject.id, 'autoLayout.gap', parseFloat(e.target.value) || 0)}
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
											placeholder={paddingMixed.isMixed ? 'Mix' : ''}
											oninput={(e) => updateThreeJSProperty($displayObject.id, `autoLayout.padding.${side}`, parseFloat(e.target.value) || 0)}
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
						{$displayObject.sizingMode === 'hug'
							? 'Container automatically resizes to fit its contents'
							: 'Container maintains fixed dimensions'
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