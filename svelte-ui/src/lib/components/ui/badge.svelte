<script lang="ts">
	import { cn } from '$lib/utils';
	import { type VariantProps, tv } from 'tailwind-variants';

	const badgeVariants = tv({
		base: 'inline-flex items-center rounded px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500',
		variants: {
			variant: {
				default: 'bg-gray-700 text-gray-200 hover:bg-gray-600',
				secondary: 'bg-gray-600 text-gray-200 hover:bg-gray-700',
				destructive: 'bg-red-600 text-white hover:bg-red-700',
				outline: 'text-gray-200 border border-gray-500 bg-gray-600'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	type Variant = VariantProps<typeof badgeVariants>['variant'];

	interface Props {
		variant?: Variant;
		class?: string;
	}

	let {
		variant = 'default',
		class: className = '',
		children,
		...restProps
	}: Props = $props();
</script>

<div class={cn(badgeVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>