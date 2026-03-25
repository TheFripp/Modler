<script lang="ts">
	import { cn } from '$lib/utils';
	import { Search } from 'lucide-svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		onSearch?: (value: string) => void;
		class?: string;
	}

	let {
		value = $bindable(''),
		placeholder = 'Search...',
		onSearch,
		class: className = ''
	}: Props = $props();

	function handleInput() {
		onSearch?.(value);
	}
</script>

<div class={cn('flex items-center gap-1.5 px-2.5 py-2 border-b border-[#2E2E2E]', className)}>
	<Search size={14} class="text-[#666] shrink-0" />
	<input
		type="text"
		{placeholder}
		bind:value
		oninput={handleInput}
		class="flex-1 bg-[#1a1a1a] border border-[#2E2E2E] rounded px-2 py-1 text-[11px] text-[#e0e0e0] outline-none focus:border-[#4a4a4a] placeholder:text-[#555]"
	/>
</div>
