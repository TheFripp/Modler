<script lang="ts">
	import { cn } from '$lib/utils';

	interface Option {
		value: string;
		label: string;
		icon?: string;
		title?: string;
	}

	interface Props {
		label?: string;
		options: Option[];
		value: string;
		onSelect: (value: string) => void;
		class?: string;
		columns?: number;
		activeClass?: string;
		inactiveClass?: string;
	}

	let {
		label = '',
		options,
		value,
		onSelect,
		class: className = '',
		columns = options.length,
		activeClass = 'border-[#404040] shadow-sm text-blue-500',
		inactiveClass = 'border-[#2E2E2E] hover:border-[#404040] text-muted-foreground',
		...restProps
	}: Props = $props();
</script>

<div class={cn('button-group', label ? 'space-y-2' : '', className)} {...restProps}>
	{#if label}
		<label class="block text-sm font-medium text-muted-foreground">{label}</label>
	{/if}

	<div class={cn('grid gap-2', `grid-cols-${columns}`)}>
		{#each options as option}
			<button
				type="button"
				class={cn(
					'px-3 py-2 text-xs font-medium border rounded-md transition-all capitalize',
					value === option.value ? activeClass : inactiveClass
				)}
				title={option.title}
				onclick={() => onSelect(option.value)}
			>
				{#if option.icon}
					<span class="mr-1">{option.icon}</span>
				{/if}
				{option.label}
			</button>
		{/each}
	</div>
</div>
