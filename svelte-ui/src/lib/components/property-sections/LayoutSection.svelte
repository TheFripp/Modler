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
