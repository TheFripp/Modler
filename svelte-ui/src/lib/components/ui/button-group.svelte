<script lang="ts">
	import { cn } from '$lib/utils';
	import Button from './button.svelte';

	interface Option {
		value: string;
		label: string;
		icon?: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value: string;
		onSelect: (value: string) => void;
		class?: string;
		columns?: number;
	}

	let {
		label,
		options,
		value,
		onSelect,
		class: className = '',
		columns = options.length,
		...restProps
	}: Props = $props();
</script>

<div class={cn('button-group space-y-2', className)} {...restProps}>
	<label class="block text-sm font-medium text-muted-foreground">{label}</label>

	<div class={cn('grid gap-2', `grid-cols-${columns}`)}>
		{#each options as option}
			<Button
				variant="outline"
				size="sm"
				class={cn(
					'text-xs',
					value === option.value && 'bg-primary text-primary-foreground border-primary'
				)}
				onclick={() => onSelect(option.value)}
			>
				{#if option.icon}
					<span class="mr-1">{option.icon}</span>
				{/if}
				{option.label}
			</Button>
		{/each}
	</div>
</div>