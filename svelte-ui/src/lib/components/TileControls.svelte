<script lang="ts">
	import InlineInput from './ui/inline-input.svelte';
	import AxisSelector from './ui/axis-selector.svelte';
	import { AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter } from 'lucide-svelte';
	import { currentUnit as unitStore, toDisplayValue, toInternalValue, getUnitStep } from '$lib/stores/units';

	// Props
	export let axis: 'x' | 'y' | 'z' | null = null;
	export let repeat: number = 3;
	export let gap: number = 0;
	export let alignment: any = null;
	export let currentUnit: string = 'm';
	export let objectId: string | number | null = null;
	export let onAxisChange: (axis: 'x' | 'y' | 'z') => void;
	export let onAlignmentChange: (axis: string, value: string) => void;

	// Determine perpendicular axes based on layout direction
	$: perpendicularAxes = axis ? ['x', 'y', 'z'].filter(a => a !== axis) : [];

	// Unit conversion for gap display
	$: gapDisplay = toDisplayValue(gap, $unitStore);
	function convertToInternal(displayVal: number): number {
		return toInternalValue(displayVal, $unitStore);
	}

	// Alignment options for each axis
	const alignmentOptions = {
		x: [
			{ value: 'left', label: 'Left', icon: AlignLeft },
			{ value: 'center', label: 'Center', icon: AlignHorizontalJustifyCenter },
			{ value: 'right', label: 'Right', icon: AlignRight }
		],
		y: [
			{ value: 'bottom', label: 'Bottom', icon: AlignLeft },
			{ value: 'center', label: 'Center', icon: AlignVerticalJustifyCenter },
			{ value: 'top', label: 'Top', icon: AlignRight }
		],
		z: [
			{ value: 'back', label: 'Back', icon: AlignLeft },
			{ value: 'center', label: 'Center', icon: AlignHorizontalJustifyCenter },
			{ value: 'front', label: 'Front', icon: AlignRight }
		]
	};

	// Get axis label
	function getAxisLabel(axisName: string): string {
		const labels = { x: 'Width', y: 'Height', z: 'Depth' };
		return labels[axisName] || axisName.toUpperCase();
	}
</script>

<div class="space-y-4">
	<!-- Axis Selection -->
	<div class="space-y-2">
		<label class="block text-sm font-medium text-muted-foreground">Axis</label>
		<AxisSelector
			activeAxis={axis}
			onSelect={onAxisChange}
			{objectId}
			variant="tile"
		/>
	</div>

	<!-- Repeat and Gap on same row -->
	<div class="grid grid-cols-2 gap-2">
		<InlineInput
			label="Repeat"
			type="number"
			bind:value={repeat}
			{objectId}
			property="autoLayout.tileMode.repeat"
			min={2}
			max={20}
			step={1}
		/>
		<InlineInput
			label="Gap"
			type="number"
			value={gapDisplay}
			{objectId}
			property="autoLayout.gap"
			min={0}
			step={getUnitStep($unitStore)}
			suffix={$unitStore}
			{convertToInternal}
		/>
	</div>

	<!-- Alignment Controls (only show when axis is selected) -->
	{#if axis && perpendicularAxes.length > 0}
		<div class="space-y-3">
			<label class="block text-sm font-medium text-muted-foreground">Alignment</label>
			{#each perpendicularAxes as perpAxis}
				<div class="space-y-1">
					<div class="text-xs text-muted-foreground">{getAxisLabel(perpAxis)}</div>
					<div class="grid grid-cols-3 gap-2">
						{#each alignmentOptions[perpAxis] as option}
							{@const isActive = alignment?.[perpAxis] === option.value || (!alignment?.[perpAxis] && option.value === 'center')}
							<button
								type="button"
								onclick={() => onAlignmentChange(perpAxis, option.value)}
								class="flex items-center justify-center px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isActive
									? 'border-[#10B981] text-foreground shadow-sm'
									: 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
								title={option.label}
							>
								<svelte:component this={option.icon} size={18} />
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

</div>
