<script lang="ts">
	import { cn } from '$lib/utils';
	import { type VariantProps, tv } from 'tailwind-variants';

	const cardVariants = tv({
		base: 'rounded-lg border border-gray-600 bg-gray-800 text-gray-200 shadow-sm'
	});

	interface Props {
		class?: string;
	}

	let {
		class: className = '',
		children,
		...restProps
	}: Props = $props();
</script>

<div class={cn(cardVariants(), className)} {...restProps}>
	{@render children?.()}
</div>