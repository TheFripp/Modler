<script lang="ts">
	import { onMount } from 'svelte';
	import { FileText, Trash2, Plus, MoreVertical } from 'lucide-svelte';

	// State
	let files: any[] = [];
	let currentFileState: any = { fileName: 'Untitled', isDirty: false, lastSaved: null };
	let isLoading = false;
	let errorMessage = '';
	let isFileManagerReady = false;

	// Unsaved changes dialog state
	let showUnsavedDialog = false;
	let unsavedDialogCallback: ((choice: string) => void) | null = null;

	// Menu state
	let openMenuFileId: string | null = null;
	let showCurrentFileMenu = false;
	let isRenaming = false;
	let renameValue = '';

	// Request tracking
	let requestId = 0;
	let pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

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
			initializeFileBrowser();
			return;
		}

		// Handle FileManager events
		if (type.startsWith('file-manager-event:')) {
			const eventType = type.replace('file-manager-event:', '');
			handleFileManagerEvent(eventType, data);
		}
	}

	/**
	 * Handle FileManager events forwarded from parent
	 */
	function handleFileManagerEvent(eventType: string, data: any) {
		switch (eventType) {
			case 'file-saved':
			case 'file-loaded':
			case 'file-deleted':
				refreshFileList();
				updateCurrentFileState();
				break;

			case 'dirty-state-changed':
				updateCurrentFileState();
				break;

			case 'unsaved-changes-prompt':
				unsavedDialogCallback = data.callback;
				showUnsavedDialog = true;
				break;
		}
	}

	onMount(async () => {
		// Setup message listener
		window.addEventListener('message', handleMessage);

		// Request FileManager ready signal
		window.parent.postMessage({ type: 'request-file-manager-ready' }, '*');

		// Cleanup
		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});

	async function initializeFileBrowser() {
		if (!isFileManagerReady) return;

		// Load initial data
		await refreshFileList();
		await updateCurrentFileState();

		// Auto-load last opened scene if it exists
		try {
			const result = await sendFileRequest('getCurrentFileState');
			const lastFileId = result.state?.fileId;

			// If no file is currently loaded, try to load the last opened file
			if (!lastFileId) {
				// Check if there are any files in the list
				if (files.length > 0) {
					// Request the last opened file ID from FileManager
					const lastOpenedResult = await sendFileRequest('getLastOpenedFileId');
					const lastOpenedFileId = lastOpenedResult?.lastOpenedFileId;

					if (lastOpenedFileId) {
						// Verify the file still exists
						const fileExists = files.some(f => f.id === lastOpenedFileId);
						if (fileExists) {
							// Load the last opened file
							await handleOpenFile(lastOpenedFileId);
							return;
						}
					}

					// Fallback: Load the most recently modified file
					const sortedFiles = [...files].sort((a, b) => b.modified - a.modified);
					if (sortedFiles.length > 0) {
						await handleOpenFile(sortedFiles[0].id);
					}
				}
			}
		} catch (error) {
			console.warn('Failed to auto-load last scene:', error);
			// Continue with empty scene if auto-load fails
		}
	}

	async function refreshFileList() {
		if (!isFileManagerReady) return;

		try {
			const result = await sendFileRequest('listFiles');
			files = result.files || [];
		} catch (error) {
			console.error('Failed to load files:', error);
			errorMessage = 'Failed to load files';
		}
	}

	async function updateCurrentFileState() {
		if (!isFileManagerReady) return;

		try {
			const result = await sendFileRequest('getCurrentFileState');
			currentFileState = result.state || { fileName: 'Untitled', isDirty: false, lastSaved: null };
		} catch (error) {
			console.error('Failed to get file state:', error);
		}
	}

	async function handleNewScene() {
		if (!isFileManagerReady) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await sendFileRequest('newScene');
			if (result.success) {
				await refreshFileList();
				await updateCurrentFileState();
			} else if (!result.cancelled) {
				errorMessage = result.error || 'Failed to create new scene';
			}
		} catch (error) {
			console.error('Failed to create new scene:', error);
			errorMessage = 'Failed to create new scene';
		} finally {
			isLoading = false;
		}
	}

	async function handleOpenFile(fileId: string) {
		if (!isFileManagerReady) return;

		// If clicking the same file that's already open, do nothing
		if (fileId === currentFileState.fileId) {
			return;
		}

		// If current file has unsaved changes, save it first
		if (currentFileState.isDirty) {
			try {
				const saveResult = await sendFileRequest('saveScene');
				if (!saveResult.success) {
					console.warn('Failed to auto-save before switching files:', saveResult.error);
				}
			} catch (error) {
				console.warn('Failed to auto-save before switching files:', error);
			}
		}

		isLoading = true;
		errorMessage = '';

		try {
			const result = await sendFileRequest('loadScene', { fileId });
			if (result.success) {
				await refreshFileList();
				await updateCurrentFileState();
			} else if (!result.cancelled) {
				errorMessage = result.error || 'Failed to open file';
			}
		} catch (error) {
			console.error('Failed to open file:', error);
			errorMessage = 'Failed to open file';
		} finally {
			isLoading = false;
		}
	}

	async function handleDeleteFile(fileId: string, fileName: string) {
		if (!isFileManagerReady) return;

		// Confirm deletion
		const confirmed = confirm(`Delete "${fileName}"? This cannot be undone.`);
		if (!confirmed) {
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const result = await sendFileRequest('deleteScene', { fileId });
			if (result.success) {
				await refreshFileList();
				await updateCurrentFileState();
			} else {
				errorMessage = result.error || 'Failed to delete file';
			}
		} catch (error) {
			console.error('Failed to delete file:', error);
			errorMessage = 'Failed to delete file';
		} finally {
			isLoading = false;
		}
	}

	async function handleSaveCurrentFile() {
		if (!isFileManagerReady) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await sendFileRequest('saveScene');
			if (result.success) {
				await refreshFileList();
				await updateCurrentFileState();
			} else {
				errorMessage = result.error || 'Failed to save file';
			}
		} catch (error) {
			console.error('Failed to save file:', error);
			errorMessage = 'Failed to save file';
		} finally {
			isLoading = false;
		}
	}

	function handleUnsavedDialogChoice(choice: string) {
		if (unsavedDialogCallback) {
			sendFileRequest('unsavedChangesResponse', { callback: unsavedDialogCallback, choice });
			unsavedDialogCallback = null;
		}
		showUnsavedDialog = false;
	}

	function toggleMenu(fileId: string) {
		openMenuFileId = openMenuFileId === fileId ? null : fileId;
	}

	function closeMenu() {
		openMenuFileId = null;
	}

	function toggleCurrentFileMenu() {
		showCurrentFileMenu = !showCurrentFileMenu;
	}

	function closeCurrentFileMenu() {
		showCurrentFileMenu = false;
	}

	function startRename() {
		renameValue = currentFileState.fileName;
		isRenaming = true;
		closeCurrentFileMenu();
	}

	async function handleRename() {
		if (!renameValue.trim() || renameValue === currentFileState.fileName) {
			isRenaming = false;
			return;
		}

		try {
			const result = await sendFileRequest('renameCurrentFile', { newName: renameValue.trim() });
			if (result.success) {
				await updateCurrentFileState();
			} else {
				errorMessage = result.error || 'Failed to rename file';
			}
		} catch (error) {
			console.error('Failed to rename file:', error);
			errorMessage = 'Failed to rename file';
		} finally {
			isRenaming = false;
		}
	}

	function cancelRename() {
		isRenaming = false;
		renameValue = '';
	}

	async function handleDeleteCurrentFile() {
		if (!currentFileState.fileId) {
			errorMessage = 'No file to delete';
			return;
		}

		const confirmed = confirm(`Delete "${currentFileState.fileName}"? This cannot be undone.`);
		if (!confirmed) return;

		closeCurrentFileMenu();

		try {
			const result = await sendFileRequest('deleteScene', { fileId: currentFileState.fileId });
			if (result.success) {
				// Refresh file list first
				await refreshFileList();

				// If there are other files, load the first one
				// Otherwise, just clear the scene without auto-saving
				if (files.length > 0) {
					await handleOpenFile(files[0].id);
				} else {
					// Clear scene without creating a new file
					await sendFileRequest('newScene', { skipAutoSave: true });
					await updateCurrentFileState();
				}
			} else {
				errorMessage = result.error || 'Failed to delete file';
			}
		} catch (error) {
			console.error('Failed to delete file:', error);
			errorMessage = 'Failed to delete file';
		}
	}

	function formatTimestamp(timestamp: number | null): string {
		if (!timestamp) return 'Never';

		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		// Less than 1 minute
		if (diff < 60000) {
			const seconds = Math.floor(diff / 1000);
			return `${seconds}s ago`;
		}

		// Less than 1 hour
		if (diff < 3600000) {
			const minutes = Math.floor(diff / 60000);
			return `${minutes}m ago`;
		}

		// Less than 1 day
		if (diff < 86400000) {
			const hours = Math.floor(diff / 3600000);
			return `${hours}h ago`;
		}

		// Format as date
		return date.toLocaleDateString();
	}
</script>

<!-- File Browser Container -->
<div class="file-browser flex flex-col h-full bg-[#171717] text-foreground">
	<!-- Current File Status -->
	<div class="current-file-status border-b border-[#2E2E2E] p-4 shrink-0">
		<div class="text-xs text-foreground/60 mb-1">Currently editing:</div>

		{#if isRenaming}
			<!-- Rename Input -->
			<div class="flex items-center gap-2 mb-2">
				<input
					type="text"
					bind:value={renameValue}
					class="flex-1 px-2 py-1 bg-[#2E2E2E] border border-[#3A3A3A] rounded text-sm focus:outline-none focus:border-blue-500"
					onkeydown={(e) => {
						if (e.key === 'Enter') handleRename();
						if (e.key === 'Escape') cancelRename();
					}}
					autofocus
				/>
				<button
					onclick={handleRename}
					class="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
				>
					Save
				</button>
				<button
					onclick={cancelRename}
					class="px-2 py-1 bg-[#2E2E2E] hover:bg-[#3A3A3A] rounded text-xs transition-colors"
				>
					Cancel
				</button>
			</div>
		{:else}
			<!-- File Name Display -->
			<div class="flex items-center justify-between mb-2">
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<div class="font-medium truncate">
						{currentFileState.fileName}
						{#if currentFileState.isDirty}
							<span class="text-blue-500 ml-2">●</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2 flex-shrink-0">
					{#if currentFileState.lastSaved}
						<div class="text-xs text-foreground/60">
							Saved {formatTimestamp(currentFileState.lastSaved)}
						</div>
					{/if}

					<!-- Menu Button -->
					<div class="relative">
						<button
							onclick={toggleCurrentFileMenu}
							class="p-1 rounded hover:bg-[#2E2E2E] transition-colors"
							disabled={!isFileManagerReady}
						>
							<MoreVertical size={16} class="text-foreground/60" />
						</button>

						<!-- Dropdown Menu -->
						{#if showCurrentFileMenu}
							<div
								class="absolute right-0 top-full mt-1 bg-[#2E2E2E] border border-[#3A3A3A] rounded-lg shadow-lg overflow-hidden z-10 min-w-[120px]"
								onclick={(e) => e.stopPropagation()}
							>
								<button
									onclick={startRename}
									class="w-full px-4 py-2 text-left text-sm hover:bg-[#3A3A3A] transition-colors"
								>
									Rename
								</button>
								<button
									onclick={handleDeleteCurrentFile}
									class="w-full px-4 py-2 text-left text-sm hover:bg-[#3A3A3A] transition-colors text-red-400"
								>
									Delete
								</button>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Actions -->
	<div class="actions p-4 border-b border-[#2E2E2E] shrink-0">
		<button
			onclick={handleNewScene}
			class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#2E2E2E] hover:bg-[#3A3A3A] rounded transition-colors"
			disabled={isLoading || !isFileManagerReady}
		>
			<Plus size={18} />
			<span>New Scene</span>
		</button>
	</div>

	<!-- Error Message -->
	{#if errorMessage}
		<div class="error-message mx-4 mt-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400">
			{errorMessage}
		</div>
	{/if}

	<!-- File List -->
	<div class="file-list flex-1 overflow-y-auto p-4">
		{#if !isFileManagerReady}
			<div class="empty-state text-center text-foreground/60 py-8">
				<p>Loading file system...</p>
			</div>
		{:else if files.length === 0}
			<div class="empty-state text-center text-foreground/60 py-8">
				<FileText size={48} class="mx-auto mb-4 opacity-50" />
				<p>No saved files yet</p>
				<p class="text-sm mt-2">Create a scene and it will be auto-saved here</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each files as file}
					<div
						class="file-item flex items-center gap-3 p-2 rounded-lg hover:bg-[#2E2E2E] transition-colors cursor-pointer relative group"
						onclick={() => handleOpenFile(file.id)}
					>
						<!-- Thumbnail -->
						<div class="flex-shrink-0">
							{#if file.thumbnail}
								<div class="w-14 h-14 bg-[#0A0A0A] rounded overflow-hidden">
									<img src={file.thumbnail} alt={file.name} class="w-full h-full object-cover" />
								</div>
							{:else}
								<div class="w-14 h-14 bg-[#2E2E2E] rounded flex items-center justify-center">
									<FileText size={24} class="text-foreground/30" />
								</div>
							{/if}
						</div>

						<!-- File Info -->
						<div class="flex-1 min-w-0">
							<div class="file-name font-medium truncate text-sm">{file.name}</div>
							<div class="file-meta text-xs text-foreground/60">
								Modified {formatTimestamp(file.modified)}
							</div>
						</div>

						<!-- Menu Button -->
						<div class="flex-shrink-0 relative">
							<button
								onclick={(e) => { e.stopPropagation(); toggleMenu(file.id); }}
								class="p-2 rounded-full hover:bg-[#3A3A3A] transition-colors opacity-0 group-hover:opacity-100"
								disabled={isLoading}
							>
								<MoreVertical size={18} class="text-foreground/60" />
							</button>

							<!-- Dropdown Menu -->
							{#if openMenuFileId === file.id}
								<div
									class="absolute right-0 top-full mt-1 bg-[#2E2E2E] border border-[#3A3A3A] rounded-lg shadow-lg overflow-hidden z-10 min-w-[120px]"
									onclick={(e) => e.stopPropagation()}
								>
									<button
										onclick={() => { handleOpenFile(file.id); closeMenu(); }}
										class="w-full px-4 py-2 text-left text-sm hover:bg-[#3A3A3A] transition-colors"
									>
										Open
									</button>
									<button
										onclick={() => { handleDeleteFile(file.id, file.name); closeMenu(); }}
										class="w-full px-4 py-2 text-left text-sm hover:bg-[#3A3A3A] transition-colors text-red-400"
									>
										Delete
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Unsaved Changes Dialog -->
{#if showUnsavedDialog}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-[#1E1E1E] border border-[#2E2E2E] rounded-lg p-6 max-w-md w-full mx-4">
			<h3 class="text-lg font-semibold mb-4">Unsaved Changes</h3>
			<p class="text-foreground/80 mb-6">
				You have unsaved changes. Do you want to save before continuing?
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => handleUnsavedDialogChoice('save')}
					class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
				>
					Save
				</button>
				<button
					onclick={() => handleUnsavedDialogChoice('dont-save')}
					class="flex-1 px-4 py-2 bg-[#2E2E2E] hover:bg-[#3A3A3A] rounded transition-colors"
				>
					Don't Save
				</button>
				<button
					onclick={() => handleUnsavedDialogChoice('cancel')}
					class="flex-1 px-4 py-2 bg-[#2E2E2E] hover:bg-[#3A3A3A] rounded transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.file-browser {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.file-list::-webkit-scrollbar {
		width: 8px;
	}

	.file-list::-webkit-scrollbar-track {
		background: #0a0a0a;
	}

	.file-list::-webkit-scrollbar-thumb {
		background: #2e2e2e;
		border-radius: 4px;
	}

	.file-list::-webkit-scrollbar-thumb:hover {
		background: #3a3a3a;
	}
</style>
