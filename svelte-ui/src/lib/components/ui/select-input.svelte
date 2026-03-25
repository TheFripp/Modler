<script lang="ts">
	import { cn } from '$lib/utils';

	interface SelectOption {
		value: string;
		label: string;
	}

	interface Props {
		label?: string;
		options: SelectOption[];
		value: string;
		onSelect: (value: string) => void;
		class?: string;
	}

	let {
		label,
		options,
		value = $bindable(),
		onSelect,
		class: className = ''
	}: Props = $props();

	function handleChange() {
		onSelect(value);
	}
</script>

<div class={cn('flex items-center gap-2', className)}>
	{#if label}
		<span class="text-[11px] text-muted-foreground shrink-0">{label}</span>
	{/if}
	<select
		bind:value
		onchange={handleChange}
		class="w-full h-8 px-3 pr-8 bg-[#212121]/50 border border-[#2E2E2E]/50 rounded-md text-xs text-foreground focus:outline-none focus:border-[#6b7280] transition-colors appearance-none"
		style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2210%22%20height%3D%225%22%20viewBox%3D%220%200%2010%205%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M0%200l5%205%205-5z%22/%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 8px 4px;"
	>
		{#each options as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</div>
