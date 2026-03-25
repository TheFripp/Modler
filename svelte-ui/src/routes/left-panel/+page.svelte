<script lang="ts">
	import { onMount } from 'svelte';
	import { Plus, FolderOpen, Settings } from 'lucide-svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import ObjectTree from '$lib/components/ObjectTree.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import FileBrowser from '$lib/components/FileBrowser.svelte';
	import YardPanel from '$lib/components/YardPanel.svelte';
	import MaterialsPanel from '$lib/components/MaterialsPanel.svelte';
	import { showAddToYardDialog, addToYardObjectData } from '$lib/stores/yard';

	// Tab state
	let activeTab: 'objects' | 'yard' | 'materials' | 'files' | 'settings' = 'objects';
	let settingsPanel: SettingsPanel;

	// Current file state
	let currentFileName = 'Untitled';
	let isDirty = false;
	let isFileManagerReady = false;

	// Request tracking
	let requestId = 0;
	let pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

	// Reload settings when switching to settings tab
	$: if (activeTab === 'settings' && settingsPanel) {
		settingsPanel.reload();
	}

	/**
	 * Send file operation request via PostMessage
	 */
	async function sendFileRequest(operation: string, params: any = {}): Promise<any> {
		return new Promise((resolve, reject) => {
			const id = ++requestId;
			pendingRequests.set(id, { resolve, reject });

			window.parent.postMessage(
				{
					type: 'file-manager-request',
					data: {
						requestId: id,
						operation: operation,
						params: params
					}
				},
				'*'
			);

			// Timeout after 10 seconds
			setTimeout(() => {
				if (pendingRequests.has(id)) {
					pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	/**
	 * Handle messages from parent window
	 */
	function handleMessage(event: MessageEvent) {
		const { type, data } = event.data;

		// Handle responses to our requests
		if (type === 'file-manager-response' && data?.requestId !== undefined) {
			const pending = pendingRequests.get(data.requestId);
			if (pending) {
				pendingRequests.delete(data.requestId);
				if (data.result?.success !== false) {
					pending.resolve(data.result);
				} else {
					pending.reject(new Error(data.result?.error || 'Operation failed'));
				}
			}
			return;
		}

		// Handle FileManager ready signal
		if (type === 'file-manager-ready') {
			isFileManagerReady = true;
			updateCurrentFileState();
			return;
		}

		// Handle Yard: open Add to Yard dialog
		if (type === 'show-add-to-yard-dialog') {
			activeTab = 'yard';
			addToYardObjectData.set(data);
			showAddToYardDialog.set(true);
			return;
		}

		// Handle FileManager events
		if (type.startsWith('file-manager-event:')) {
			const eventType = type.replace('file-manager-event:', '');
			if (eventType === 'file-saved' || eventType === 'file-loaded' || eventType === 'dirty-state-changed') {
				updateCurrentFileState();
			}
		}
	}

	async function updateCurrentFileState() {
		if (!isFileManagerReady) return;

		try {
			const result = await sendFileRequest('getCurrentFileState');
			const state = result.state || { fileName: 'Untitled', isDirty: false };
			currentFileName = state.fileName;
			isDirty = state.isDirty;
		} catch (error) {
			console.error('Failed to get file state:', error);
		}
	}

	async function handleNewScene() {
		if (!isFileManagerReady) return;

		try {
			const result = await sendFileRequest('newScene');
			if (result.success) {
				await updateCurrentFileState();
				// Switch to files tab to show the new file
				activeTab = 'files';
			}
		} catch (error) {
			console.error('Failed to create new scene:', error);
		}
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();

		// SimpleCommunication: No initialization needed - automatic postMessage handling

		// Setup message listener
		window.addEventListener('message', handleMessage);

		// Request FileManager ready signal
		window.parent.postMessage({ type: 'request-file-manager-ready' }, '*');

		// Notify main app that left panel is ready to receive data
		window.parent.postMessage({ type: 'left-panel-ready' }, '*');

		// Cleanup
		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});
</script>

<!-- Standalone Left Panel for iframe integration -->
<div class="h-screen w-full flex flex-col bg-[#171717] text-foreground overflow-hidden">
	<!-- Header: Scene name + utility icon buttons -->
	<div class="flex items-center justify-between px-4 py-3 border-b border-[#2E2E2E] shrink-0">
		<div class="flex items-center gap-2 flex-1 min-w-0">
			<span class="font-medium truncate">
				{currentFileName}
				{#if isDirty}
					<span class="text-blue-500 ml-2">●</span>
				{/if}
			</span>
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => (activeTab = 'files')}
				class="p-2 rounded transition-colors {activeTab === 'files'
					? 'bg-[#2E2E2E] text-foreground'
					: 'hover:bg-[#2E2E2E] text-foreground/60'}"
				title="Files"
			>
				<FolderOpen size={16} />
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'settings')}
				class="p-2 rounded transition-colors {activeTab === 'settings'
					? 'bg-[#2E2E2E] text-foreground'
					: 'hover:bg-[#2E2E2E] text-foreground/60'}"
				title="Settings"
			>
				<Settings size={16} />
			</button>
			<button
				onclick={handleNewScene}
				class="p-2 rounded hover:bg-[#2E2E2E] transition-colors"
				disabled={!isFileManagerReady}
				title="New Scene"
			>
				<Plus size={16} class="text-foreground/60" />
			</button>
		</div>
	</div>

	<!-- Main Tabs: Objects, Yard, Materials -->
	<div class="flex border-b border-[#2E2E2E] shrink-0">
		<button
			type="button"
			onclick={() => (activeTab = 'objects')}
			class="flex-1 px-6 py-6 modler-section-title transition-colors {activeTab === 'objects'
				? 'text-foreground border-b-2 border-blue-500'
				: 'text-foreground/60 hover:text-foreground/80'}"
		>
			Objects
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'yard')}
			class="flex-1 px-6 py-6 modler-section-title transition-colors {activeTab === 'yard'
				? 'text-foreground border-b-2 border-blue-500'
				: 'text-foreground/60 hover:text-foreground/80'}"
		>
			Yard
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'materials')}
			class="flex-1 px-6 py-6 modler-section-title transition-colors {activeTab === 'materials'
				? 'text-foreground border-b-2 border-blue-500'
				: 'text-foreground/60 hover:text-foreground/80'}"
		>
			Materials
		</button>
	</div>

	<!-- Tab Content -->
	<div class="flex-1 overflow-hidden">
		{#if activeTab === 'objects'}
			<ObjectTree />
		{:else if activeTab === 'yard'}
			<YardPanel />
		{:else if activeTab === 'materials'}
			<MaterialsPanel />
		{:else if activeTab === 'files'}
			<FileBrowser />
		{:else if activeTab === 'settings'}
			<SettingsPanel bind:this={settingsPanel} />
		{/if}
	</div>
</div>
