<script lang="ts">
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import ButtonGroup from '$lib/components/ui/button-group.svelte';
	import AxisSelector from '$lib/components/ui/axis-selector.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import { updateThreeJSProperty } from '$lib/stores/modler';

	// Props
	export let displayObject: any;
	export let objectId: string;
	export let currentUnit: string = 'm';

	// Container mode state (manual / layout / hug)
	$: currentMode = displayObject.containerMode ||
		(displayObject.autoLayout?.enabled ? 'layout' : (displayObject.isHug ? 'hug' : 'manual'));

	function setContainerMode(mode: string) {
		// Optimistic update
		displayObject = { ...displayObject, containerMode: mode };
		updateThreeJSProperty(objectId, 'containerMode', mode, 'property-panel');
	}

	// Reactive layout state
	$: isLayoutEnabled = displayObject.autoLayout?.enabled ?? false;
	$: layoutDirection = displayObject.autoLayout?.direction ?? '';

	// Reactive gap value - formatted to exactly 2 decimal places for UI display
	// toFixed(2) ensures consistent "1.20" format instead of "1.2"
	// (Internal calculations maintain full precision)
	$: gapValue = Number((displayObject.calculatedGap !== undefined
		? displayObject.calculatedGap
		: (displayObject.autoLayout?.gap ?? 0)).toFixed(2));

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
		const currentReversed = displayObject.autoLayout?.reversed ?? false;

		// Build complete autoLayout object
		const autoLayout = {
			enabled: !(currentDirection === axis && isCurrentlyEnabled),
			direction: (currentDirection === axis && isCurrentlyEnabled) ? '' : axis,
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment: displayObject.autoLayout?.alignment ?? { x: 'center', y: 'center', z: 'center' },
			reversed: currentReversed
		};

		// Optimistic update: Update local displayObject immediately for instant UI feedback
		displayObject = {
			...displayObject,
			autoLayout: autoLayout
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Handle reverse layout direction (not object order)
	function toggleReverseLayout() {
		const isReversed = displayObject.autoLayout?.reversed ?? false;

		const autoLayout = {
			enabled: displayObject.autoLayout?.enabled ?? false,
			direction: displayObject.autoLayout?.direction ?? '',
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment: displayObject.autoLayout?.alignment ?? { x: 'center', y: 'center', z: 'center' },
			reversed: !isReversed
		};

		// Optimistic update: Update local displayObject immediately for instant UI feedback
		displayObject = {
			...displayObject,
			autoLayout: autoLayout
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Handle grid-based alignment changes
	function updateGridAlignment(horizontalValue: string, verticalValue: string) {
		const currentReversed = displayObject.autoLayout?.reversed ?? false;

		// Map grid selection to alignment based on layout direction
		let alignment = { x: 'center', y: 'center', z: 'center' };

		if (layoutDirection === 'x') {
			// Layout along X, grid controls Y (vertical) and Z (horizontal)
			// Map horizontal grid position to Z axis alignment
			if (horizontalValue === 'left') alignment.z = 'back';
			else if (horizontalValue === 'right') alignment.z = 'front';
			else alignment.z = 'center';
			// Vertical already uses same values (top/center/bottom)
			alignment.y = verticalValue;
		} else if (layoutDirection === 'y') {
			// Layout along Y, grid controls X (horizontal) and Z (vertical)
			// Horizontal already uses same values (left/center/right)
			alignment.x = horizontalValue;
			// Map vertical grid position to Z axis alignment
			if (verticalValue === 'top') alignment.z = 'back';
			else if (verticalValue === 'bottom') alignment.z = 'front';
			else alignment.z = 'center';
		} else if (layoutDirection === 'z') {
			// Layout along Z, grid controls X (horizontal) and Y (vertical)
			// Both already use same values
			alignment.x = horizontalValue;
			alignment.y = verticalValue;
		}

		const autoLayout = {
			enabled: displayObject.autoLayout?.enabled ?? false,
			direction: displayObject.autoLayout?.direction ?? '',
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment,
			reversed: currentReversed
		};

		// Optimistic update: Update local displayObject immediately for instant UI feedback
		displayObject = {
			...displayObject,
			autoLayout: autoLayout
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

<PropertyGroup title="Layout" align="right">
	<div class="space-y-4">
		<!-- Container Mode -->
		<div class="space-y-2">
			<SectionHeader label="Mode" />
			<ButtonGroup
				options={[
					{ value: 'manual', label: 'Manual', title: 'Manual positioning' },
					{ value: 'layout', label: 'Layout', title: 'Auto-layout children' },
					{ value: 'hug', label: 'Hug', title: 'Auto-size to children' }
				]}
				value={currentMode}
				onSelect={setContainerMode}
				columns={3}
			/>
		</div>

		<!-- Direction -->
		<div class="space-y-2">
			<SectionHeader label="Direction" />

			<div class="flex gap-2">
				<!-- Reverse Layout Button -->
				<button
					type="button"
					onclick={toggleReverseLayout}
					disabled={!isLayoutEnabled}
					class="px-3 py-2 text-xs font-medium border border-[#2E2E2E] hover:border-[#404040] rounded-md transition-all flex items-center justify-center {!isLayoutEnabled ? 'opacity-30 cursor-not-allowed' : ''}"
					title="Reverse layout direction"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
						<path d="m2 9 3-3 3 3"></path>
						<path d="M13 18H7a2 2 0 0 1-2-2V6"></path>
						<path d="m22 15-3 3-3-3"></path>
						<path d="M11 6h6a2 2 0 0 1 2 2v10"></path>
					</svg>
				</button>

				<!-- Layout Direction Buttons -->
				<AxisSelector
					activeAxis={layoutDirection}
					onSelect={selectLayoutAxis}
					{objectId}
					class="flex-1"
				/>
			</div>
		</div>

		<!-- Gap Controls and Alignment Grid -->
		<div class="flex items-start gap-3 {!isLayoutEnabled ? 'opacity-30' : ''}">
			<div class="w-1/2">
				<InlineInput
					label="Gap"
					type="number"
					value={gapValue}
					{objectId}
					property="autoLayout.gap"
					min={0}
					step={0.1}
					disabled={!isLayoutEnabled}
				/>
				{#if displayObject.calculatedGap !== undefined}
					<span class="text-muted-foreground text-[10px]">(auto)</span>
				{/if}
			</div>

			<!-- Alignment Grid -->
			<div class="flex-shrink-0">
				<!-- 3x3 Grid Control -->
				<div class="grid grid-cols-3 gap-1.5">
					{#each ['top', 'center', 'bottom'] as vertical}
						{#each ['left', 'center', 'right'] as horizontal}
							{@const isActive = isLayoutEnabled && currentGridPosition.horizontal === horizontal && currentGridPosition.vertical === vertical}
							<button
								type="button"
								onclick={() => updateGridAlignment(horizontal, vertical)}
								disabled={!isLayoutEnabled}
								class="w-3.5 h-3.5 rounded transition-all {isActive ? 'bg-blue-500' : 'bg-[#2E2E2E] hover:bg-[#404040]'} {!isLayoutEnabled ? 'cursor-not-allowed' : ''}"
								title="{vertical}-{horizontal}"
							>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		</div>

		<!-- Padding Controls -->
		<div class="space-y-2 {!isLayoutEnabled ? 'opacity-30' : ''}">
			<SectionHeader label="Padding" />
			<div class="grid grid-cols-3 gap-2">
				<InlineInput
					label="W"
					type="number"
					value={displayObject.autoLayout?.padding?.width ?? 0}
					{objectId}
					property="autoLayout.padding.width"
					min={0}
					step={0.1}
					disabled={!isLayoutEnabled}
				/>
				<InlineInput
					label="H"
					type="number"
					value={displayObject.autoLayout?.padding?.height ?? 0}
					{objectId}
					property="autoLayout.padding.height"
					min={0}
					step={0.1}
					disabled={!isLayoutEnabled}
				/>
				<InlineInput
					label="D"
					type="number"
					value={displayObject.autoLayout?.padding?.depth ?? 0}
					{objectId}
					property="autoLayout.padding.depth"
					min={0}
					step={0.1}
					disabled={!isLayoutEnabled}
				/>
			</div>
		</div>
	</div>
</PropertyGroup>
