<script lang="ts">
	import { cn } from '$lib/utils';
	import { type VariantProps, tv } from 'tailwind-variants';

	const labelVariants = tv({
		base: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
	});

	interface Props {
		for?: string;
		class?: string;
	}

	let {
		for: htmlFor,
		class: className = '',
		children,
		...restProps
	}: Props = $props();
</script>

<label
	for={htmlFor}
	class={cn(labelVariants(), className)}
	{...restProps}
>
	{@render children?.()}
</label>