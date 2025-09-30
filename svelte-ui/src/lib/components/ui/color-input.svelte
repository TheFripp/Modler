<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		label: string;
		value: string;
		onchange?: (value: string) => void;
		class?: string;
		placeholder?: string;
	}

	let {
		label,
		value = '#ffffff',
		onchange,
		class: className = '',
		placeholder = '#ffffff',
		...restProps
	}: Props = $props();

	// Ensure color is properly formatted with # prefix
	const formattedValue = $derived(
		value && typeof value === 'string' && !value.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(value)
			? '#' + value
			: (typeof value === 'string' ? value : null) || '#ffffff'
	);

	function handleColorChange(event: Event) {
		const target = event.target as HTMLInputElement;
		let colorValue = target.value;

		// Ensure color has # prefix for hex values
		if (colorValue && !colorValue.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(colorValue)) {
			colorValue = '#' + colorValue;
		}

		if (onchange) {
			onchange(colorValue);
		}
	}

	function handleTextFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;
		target.select();
	}
</script>

<div class={cn('color-input-container', className)} {...restProps}>
	<!-- Horizontal layout with label, hex value, and color square -->
	<div class="flex items-center bg-[#212121]/50 rounded-md h-8 border border-[#2E2E2E]/50 focus-within:border-[#6b7280] transition-colors">
		<span class="text-xs text-muted-foreground px-2 py-1 flex-shrink-0 min-w-0 truncate">{label}</span>
		<input
			type="text"
			value={formattedValue}
			onchange={handleColorChange}
			onfocus={handleTextFocus}
			class="flex-1 bg-transparent border-none outline-none text-xs text-foreground px-1 py-1 font-mono min-w-0"
			{placeholder}
		/>
		<div class="border-l border-[#2E2E2E]/50 px-1">
			<input
				type="color"
				value={formattedValue}
				onchange={handleColorChange}
				class="w-7 h-7 rounded cursor-pointer bg-transparent border border-[#171717]"
				style="border-radius: 4px;"
			/>
		</div>
	</div>
</div>