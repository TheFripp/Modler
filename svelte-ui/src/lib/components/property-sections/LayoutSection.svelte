<script lang="ts">
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import { updateThreeJSProperty } from '$lib/stores/modler';

	// Props
	export let displayObject: any;
	export let objectId: string;
	export let currentUnit: string = 'm';

	// Reactive layout button states
	$: isLayoutEnabled = displayObject.autoLayout?.enabled ?? false;
	$: layoutDirection = displayObject.autoLayout?.direction ?? '';
	$: isXActive = isLayoutEnabled && layoutDirection === 'x';
	$: isYActive = isLayoutEnabled && layoutDirection === 'y';
	$: isZActive = isLayoutEnabled && layoutDirection === 'z';

	// Reactive gap value
	$: gapValue = displayObject.calculatedGap !== undefined
		? displayObject.calculatedGap
		: (displayObject.autoLayout?.gap ?? 0);

	// Reactive alignment values
	$: alignmentX = displayObject.autoLayout?.alignment?.x ?? 'center';
	$: alignmentY = displayObject.autoLayout?.alignment?.y ?? 'center';
	$: alignmentZ = displayObject.autoLayout?.alignment?.z ?? 'center';

	// Get perpendicular axes for alignment (based on layout direction)
	$: perpendicularAxes = layoutDirection === 'x' ? ['y', 'z']
		: layoutDirection === 'y' ? ['x', 'z']
		: layoutDirection === 'z' ? ['x', 'y']
		: [];

	// Handle layout axis selection with toggle behavior
	function selectLayoutAxis(axis: string) {
		if (!axis || !['x', 'y', 'z'].includes(axis)) {
			console.error('❌ Invalid layout axis:', axis);
			return;
		}

		const currentDirection = displayObject.autoLayout?.direction;
		const isCurrentlyEnabled = displayObject.autoLayout?.enabled;

		// Build complete autoLayout object
		const autoLayout = {
			enabled: !(currentDirection === axis && isCurrentlyEnabled),
			direction: (currentDirection === axis && isCurrentlyEnabled) ? '' : axis,
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			}
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Handle grid-based alignment changes
	function updateGridAlignment(horizontalValue: string, verticalValue: string) {
		// Map grid selection to alignment based on layout direction
		let alignment = { x: 'center', y: 'center', z: 'center' };

		if (layoutDirection === 'x') {
			// Layout along X, grid controls Y (vertical) and Z (horizontal)
			alignment.z = horizontalValue; // Left/Center/Right maps to Back/Center/Front
			alignment.y = verticalValue;   // Top/Center/Bottom
		} else if (layoutDirection === 'y') {
			// Layout along Y, grid controls X (horizontal) and Z (vertical)
			alignment.x = horizontalValue; // Left/Center/Right
			alignment.z = verticalValue;   // Top/Center/Bottom maps to Back/Center/Front
		} else if (layoutDirection === 'z') {
			// Layout along Z, grid controls X (horizontal) and Y (vertical)
			alignment.x = horizontalValue; // Left/Center/Right
			alignment.y = verticalValue;   // Top/Center/Bottom
		}

		const autoLayout = {
			enabled: displayObject.autoLayout?.enabled ?? false,
			direction: displayObject.autoLayout?.direction ?? '',
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Get current grid position based on layout direction
	$: currentGridPosition = (() => {
		if (!layoutDirection) return { horizontal: 'center', vertical: 'center' };

		if (layoutDirection === 'x') {
			// Layout along X: horizontal = Z axis, vertical = Y axis
			const horizontal = alignmentZ === 'back' ? 'left' : alignmentZ === 'front' ? 'right' : 'center';
			const vertical = alignmentY === 'top' ? 'top' : alignmentY === 'bottom' ? 'bottom' : 'center';
			return { horizontal, vertical };
		} else if (layoutDirection === 'y') {
			// Layout along Y: horizontal = X axis, vertical = Z axis
			const horizontal = alignmentX === 'left' ? 'left' : alignmentX === 'right' ? 'right' : 'center';
			const vertical = alignmentZ === 'back' ? 'top' : alignmentZ === 'front' ? 'bottom' : 'center';
			return { horizontal, vertical };
		} else if (layoutDirection === 'z') {
			// Layout along Z: horizontal = X axis, vertical = Y axis
			const horizontal = alignmentX === 'left' ? 'left' : alignmentX === 'right' ? 'right' : 'center';
			const vertical = alignmentY === 'top' ? 'top' : alignmentY === 'bottom' ? 'bottom' : 'center';
			return { horizontal, vertical };
		}

		return { horizontal: 'center', vertical: 'center' };
	})();
</script>

<PropertyGroup title="Layout">
	<div class="space-y-4">
		<!-- Layout Direction -->
		<div class="space-y-2">
			<label class="block text-sm font-medium text-muted-foreground">
				Layout Direction
				{#if !isLayoutEnabled}
					<span class="text-[10px] text-muted-foreground/60">(off)</span>
				{/if}
			</label>

			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					onclick={() => selectLayoutAxis('x')}
					class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all flex items-center justify-center {isXActive ? 'border-blue-500 text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
					title="Width (X axis)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="5 9 2 12 5 15"></polyline>
						<polyline points="19 9 22 12 19 15"></polyline>
						<line x1="2" y1="12" x2="22" y2="12"></line>
					</svg>
				</button>
				<button
					type="button"
					onclick={() => selectLayoutAxis('y')}
					class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all flex items-center justify-center {isYActive ? 'border-blue-500 text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
					title="Height (Y axis)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 19 12 22 15 19"></polyline>
						<polyline points="9 5 12 2 15 5"></polyline>
						<line x1="12" y1="2" x2="12" y2="22"></line>
					</svg>
				</button>
				<button
					type="button"
					onclick={() => selectLayoutAxis('z')}
					class="px-3 py-2 text-xs font-medium border-2 rounded-md transition-all flex items-center justify-center {isZActive ? 'border-blue-500 text-foreground shadow-sm' : 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
					title="Depth (Z axis)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="17 8 21 12 17 16"></polyline>
						<polyline points="7 16 3 12 7 8"></polyline>
						<line x1="3" y1="12" x2="21" y2="12"></line>
						<polyline points="12 3 16 7 12 11"></polyline>
						<polyline points="12 21 8 17 12 13"></polyline>
					</svg>
				</button>
			</div>
		</div>

		<!-- Gap Controls -->
		<div class="space-y-2">
			<label class="block text-sm font-medium text-muted-foreground">
				Gap ({currentUnit})
				{#if displayObject.calculatedGap !== undefined}
					<span class="text-muted-foreground text-[10px]">(auto)</span>
				{/if}
			</label>
			<InlineInput
				label="Gap"
				type="number"
				value={gapValue}
				{objectId}
				property="autoLayout.gap"
				min={0}
				step={0.1}
			/>
		</div>

		<!-- Alignment Grid (only show when layout is enabled) -->
		{#if isLayoutEnabled}
			<div class="space-y-2">
				<label class="block text-sm font-medium text-muted-foreground">
					Alignment
					<span class="text-[10px] text-muted-foreground/60">(cross-section view)</span>
				</label>

				<!-- 3x3 Grid Control -->
				<div class="grid grid-cols-3 gap-1.5 w-fit mx-auto">
					{#each ['top', 'center', 'bottom'] as vertical}
						{#each ['left', 'center', 'right'] as horizontal}
							{@const isActive = currentGridPosition.horizontal === horizontal && currentGridPosition.vertical === vertical}
							<button
								type="button"
								onclick={() => updateGridAlignment(horizontal, vertical)}
								class="w-4 h-4 rounded transition-all {isActive ? 'bg-blue-500' : 'bg-[#2E2E2E] hover:bg-[#404040]'}"
								title="{vertical}-{horizontal}"
							>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Padding Controls -->
		<div class="space-y-2">
			<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide">Padding</h4>
			<div class="grid grid-cols-3 gap-2">
				<InlineInput
					label="W"
					type="number"
					value={displayObject.autoLayout?.padding?.width ?? 0}
					{objectId}
					property="autoLayout.padding.width"
					min={0}
					step={0.1}
				/>
				<InlineInput
					label="H"
					type="number"
					value={displayObject.autoLayout?.padding?.height ?? 0}
					{objectId}
					property="autoLayout.padding.height"
					min={0}
					step={0.1}
				/>
				<InlineInput
					label="D"
					type="number"
					value={displayObject.autoLayout?.padding?.depth ?? 0}
					{objectId}
					property="autoLayout.padding.depth"
					min={0}
					step={0.1}
				/>
			</div>
		</div>

		<div class="text-xs text-muted-foreground italic">
			{displayObject.autoLayout?.enabled
				? `Layout active: ${displayObject.autoLayout.direction?.toUpperCase()} axis`
				: 'No layout active - container in hug mode'
			}
		</div>
	</div>
</PropertyGroup>
