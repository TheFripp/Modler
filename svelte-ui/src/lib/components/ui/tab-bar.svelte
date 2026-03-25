<script lang="ts">
	import { cn } from '$lib/utils';

	interface Tab {
		id: string;
		label: string;
	}

	interface Props {
		tabs: Tab[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
		class?: string;
	}

	let {
		tabs,
		activeTab,
		onTabChange,
		class: className = ''
	}: Props = $props();
</script>

<div class={cn('flex border-b border-[#2E2E2E] shrink-0', className)}>
	{#each tabs as tab}
		<button
			type="button"
			onclick={() => onTabChange(tab.id)}
			class={cn(
				'flex-1 px-6 py-6 modler-section-title transition-colors',
				activeTab === tab.id
					? 'text-foreground border-b-2 border-blue-500'
					: 'text-foreground/60 hover:text-foreground/80'
			)}
		>
			{tab.label}
		</button>
	{/each}
</div>
