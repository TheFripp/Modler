<script lang="ts">
	import { toDisplayValue, currentUnit } from '$lib/stores/units';
	import { placeYardItem, removeItemFromYard } from '$lib/stores/yard';
	import type { YardItem } from '$lib/stores/yard';

	let { item }: { item: YardItem } = $props();

	function formatDim(value: number, fixed: boolean): string {
		const display = toDisplayValue(value);
		if (fixed) return `${display}`;
		return `${display}~`;
	}

	function dimSummary(): string {
		const x = formatDim(item.dimensions.x, item.fixedDimensions.x);
		const y = formatDim(item.dimensions.y, item.fixedDimensions.y);
		const z = formatDim(item.dimensions.z, item.fixedDimensions.z);
		return `${x} × ${y} × ${z}`;
	}

	function handleClick() {
		placeYardItem(item.id);
	}

	function handleRemove(e: MouseEvent) {
		e.stopPropagation();
		removeItemFromYard(item.id);
	}
</script>

<button
	type="button"
	class="yard-item-card"
	onclick={handleClick}
	title="Click to place in scene"
>
	<div class="yard-item-color" style="background-color: {item.material.color}"></div>
	<span class="yard-item-name">{item.name}</span>
	<span class="yard-item-dims">{dimSummary()} {$currentUnit}</span>
	{#if item.source === 'user'}
		<button
			type="button"
			class="yard-item-remove"
			onclick={handleRemove}
			title="Remove from Yard"
		>×</button>
	{/if}
</button>

<style>
	.yard-item-card {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		background: #1e1e1e;
		border: 1px solid #2e2e2e;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s, background 0.15s;
	}
	.yard-item-card:hover {
		border-color: #4a4a4a;
		background: #252525;
	}

	.yard-item-color {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.yard-item-name {
		font-size: 12px;
		font-weight: 500;
		color: #e0e0e0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.yard-item-dims {
		font-size: 10px;
		color: #888;
		font-family: monospace;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.yard-item-remove {
		background: none;
		border: none;
		color: #666;
		font-size: 14px;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
		flex-shrink: 0;
	}
	.yard-item-remove:hover {
		color: #e44;
	}
</style>
