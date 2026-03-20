<script lang="ts">
	import { cn } from '$lib/utils';
	import { MoveHorizontal, MoveVertical, MoveDiagonal } from 'lucide-svelte';

	interface Props {
		activeAxis: string | null;
		onSelect: (axis: 'x' | 'y' | 'z') => void;
		objectId?: string | number | null;
		variant?: 'layout' | 'tile';
		class?: string;
	}

	let {
		activeAxis,
		onSelect,
		objectId = null,
		variant = 'layout',
		class: className = '',
	}: Props = $props();

	const isActive = (axis: string) => activeAxis === axis;

	const titles = {
		layout: { x: 'Width (X axis)', y: 'Height (Y axis)', z: 'Depth (Z axis)' },
		tile: { x: 'Width', y: 'Height', z: 'Depth' }
	};

	function handleHover(axis: string, isHovering: boolean) {
		if (!objectId) return;
		window.parent.postMessage({
			type: 'button-hover',
			buttonType: 'layout',
			objectId,
			axis,
			isHovering
		}, '*');
	}

	function buttonClass(axis: string): string {
		const active = isActive(axis);
		const base = 'px-3 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center';

		if (variant === 'tile') {
			return cn(base, 'border-2', active
				? 'border-blue-500 text-foreground shadow-sm'
				: 'border-[#2E2E2E] text-muted-foreground hover:border-[#404040] hover:text-foreground');
		}

		// layout variant (default)
		return cn(base, 'border', active
			? 'border-[#404040] shadow-sm'
			: 'border-[#2E2E2E] hover:border-[#404040]');
	}

	function iconClass(axis: string): string {
		if (variant === 'tile') return ''; // tile variant uses button-level text color
		return isActive(axis) ? 'text-blue-500' : 'text-muted-foreground';
	}
</script>

<div class={cn('grid grid-cols-3 gap-2', className)}>
	{#each ['x', 'y', 'z'] as axis}
		<button
			type="button"
			class={buttonClass(axis)}
			title={titles[variant][axis]}
			onclick={() => onSelect(axis)}
			onmouseenter={() => handleHover(axis, true)}
			onmouseleave={() => handleHover(axis, false)}
		>
			{#if variant === 'tile'}
				{#if axis === 'x'}<MoveHorizontal size={18} />
				{:else if axis === 'y'}<MoveVertical size={18} />
				{:else}<MoveDiagonal size={18} />
				{/if}
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={iconClass(axis)}>
					{#if axis === 'x'}
						<polyline points="5 9 2 12 5 15"></polyline>
						<polyline points="19 9 22 12 19 15"></polyline>
						<line x1="2" y1="12" x2="22" y2="12"></line>
					{:else if axis === 'y'}
						<polyline points="9 19 12 22 15 19"></polyline>
						<polyline points="9 5 12 2 15 5"></polyline>
						<line x1="12" y1="2" x2="12" y2="22"></line>
					{:else}
						<polyline points="13 5 19 5 19 11"></polyline>
						<polyline points="11 19 5 19 5 13"></polyline>
						<line x1="19" y1="5" x2="5" y2="19"></line>
					{/if}
				</svg>
			{/if}
		</button>
	{/each}
</div>
