<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	// Keyboard handlers REMOVED - now centralized in KeyboardRouter
	// Main application's KeyboardRouter handles all shortcuts with priority-based delegation
	// UI panels are passive receivers via PostMessage, not active keyboard listeners
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Modler V2 - Svelte UI</title>
</svelte:head>

{@render children?.()}
