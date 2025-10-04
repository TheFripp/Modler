<script lang="ts">
	import InlineInput from './ui/inline-input.svelte';
	import { MoveHorizontal, MoveVertical, MoveDiagonal } from 'lucide-svelte';

	// Props
	export let axis: 'x' | 'y' | 'z' | null = null;
	export let repeat: number = 3;
	export let gap: number = 0;
	export let currentUnit: string = 'm';
	export let objectId: string | number | null = null;
	export let onAxisChange: (axis: 'x' | 'y' | 'z') => void;

	// Reactive axis button states
	$: isXActive = axis === 'x';
	$: isYActive = axis === 'y';
	$: isZActive = axis === 'z';
</script>

<div class="space-y-4">
	<!-- Axis Selection -->
	<div class="space-y-2">
		<label class="block text-sm font-medium text-muted-foreground">Axis</label>
		<div class="grid grid-cols-3 gap-2">
			<button
				type="button"
				onclick={() => onAxisChange('x')}
				class="flex items-center justify-center px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isXActive
					? 'border-[#10B981] text-foreground shadow-sm'
					: 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
				title="Width"
			>
				<MoveHorizontal size={18} />
			</button>
			<button
				type="button"
				onclick={() => onAxisChange('y')}
				class="flex items-center justify-center px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isYActive
					? 'border-[#10B981] text-foreground shadow-sm'
					: 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
				title="Height"
			>
				<MoveVertical size={18} />
			</button>
			<button
				type="button"
				onclick={() => onAxisChange('z')}
				class="flex items-center justify-center px-3 py-2 text-xs font-medium border-2 rounded-md transition-all {isZActive
					? 'border-[#10B981] text-foreground shadow-sm'
					: 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground'}"
				title="Depth"
			>
				<MoveDiagonal size={18} />
			</button>
		</div>
	</div>

	<!-- Repeat and Gap on same row -->
	<div class="grid grid-cols-2 gap-2">
		<InlineInput
			label="Repeat"
			type="number"
			value={repeat}
			{objectId}
			property="autoLayout.tileMode.repeat"
			min={2}
			max={20}
			step={1}
		/>
		<InlineInput
			label="Gap"
			type="number"
			value={gap}
			{objectId}
			property="autoLayout.gap"
			min={0}
			step={0.1}
		/>
	</div>

</div>
