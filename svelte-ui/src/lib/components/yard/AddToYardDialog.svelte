<script lang="ts">
	import { X } from 'lucide-svelte';
	import { showAddToYardDialog, addToYardObjectData, addItemToYard, yardCategories } from '$lib/stores/yard';
	import { toDisplayValue, currentUnit } from '$lib/stores/units';
	import { get } from 'svelte/store';

	const objectData = get(addToYardObjectData);

	let name = $state(objectData?.name || 'Custom Item');
	let category = $state('Custom');
	let newCategory = $state('');
	let subcategory = $state('');
	let tagsInput = $state('');
	let fixedX = $state(true);
	let fixedY = $state(true);
	let fixedZ = $state(false);
	let useNewCategory = $state(false);

	const dims = objectData?.dimensions || { x: 0.1, y: 0.1, z: 0.1 };
	const material = objectData?.material || { color: '#888888', opacity: 1, transparent: false };
	const categories = get(yardCategories);

	function handleSave() {
		const finalCategory = useNewCategory ? newCategory.trim() : category;
		if (!finalCategory) return;

		addItemToYard({
			name: name.trim() || 'Custom Item',
			category: finalCategory,
			subcategory: subcategory.trim(),
			tags: tagsInput
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
			dimensions: { ...dims },
			fixedDimensions: { x: fixedX, y: fixedY, z: fixedZ },
			material: { ...material }
		});

		handleClose();
	}

	function handleClose() {
		showAddToYardDialog.set(false);
		addToYardObjectData.set(null);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleClose();
		if (e.key === 'Enter') handleSave();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={handleClose}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="dialog" onclick={(e) => e.stopPropagation()}>
		<div class="dialog-header">
			<span class="dialog-title">Add to Yard</span>
			<button type="button" class="dialog-close" onclick={handleClose}>
				<X size={14} />
			</button>
		</div>

		<div class="dialog-body">
			<!-- Name -->
			<label class="field">
				<span class="field-label">Name</span>
				<input type="text" bind:value={name} class="field-input" />
			</label>

			<!-- Category -->
			<label class="field">
				<span class="field-label">Category</span>
				{#if useNewCategory}
					<input
						type="text"
						bind:value={newCategory}
						placeholder="New category name..."
						class="field-input"
					/>
				{:else}
					<select bind:value={category} class="field-input">
						{#each categories as cat}
							<option value={cat.name}>{cat.name}</option>
						{/each}
						<option value="Custom">Custom</option>
					</select>
				{/if}
				<button
					type="button"
					class="field-toggle"
					onclick={() => (useNewCategory = !useNewCategory)}
				>
					{useNewCategory ? 'Use existing' : '+ New'}
				</button>
			</label>

			<!-- Subcategory -->
			<label class="field">
				<span class="field-label">Subcategory</span>
				<input
					type="text"
					bind:value={subcategory}
					placeholder="Optional..."
					class="field-input"
				/>
			</label>

			<!-- Tags -->
			<label class="field">
				<span class="field-label">Tags</span>
				<input
					type="text"
					bind:value={tagsInput}
					placeholder="comma, separated, tags"
					class="field-input"
				/>
			</label>

			<!-- Dimensions with fixed toggles -->
			<div class="field">
				<span class="field-label">Dimensions ({$currentUnit})</span>
				<div class="dim-grid">
					{#each [
						{ axis: 'X', value: dims.x, fixed: fixedX, toggle: () => (fixedX = !fixedX) },
						{ axis: 'Y', value: dims.y, fixed: fixedY, toggle: () => (fixedY = !fixedY) },
						{ axis: 'Z', value: dims.z, fixed: fixedZ, toggle: () => (fixedZ = !fixedZ) }
					] as dim}
						<div class="dim-row">
							<span class="dim-axis">{dim.axis}</span>
							<span class="dim-value">{toDisplayValue(dim.value)}</span>
							<button
								type="button"
								class="dim-fixed-toggle"
								class:active={dim.fixed}
								onclick={dim.toggle}
							>
								{dim.fixed ? 'Fixed' : 'Adjustable'}
							</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- Color preview -->
			<div class="field">
				<span class="field-label">Color</span>
				<div class="color-preview" style="background-color: {material.color}"></div>
			</div>
		</div>

		<div class="dialog-footer">
			<button type="button" class="btn btn-cancel" onclick={handleClose}>Cancel</button>
			<button type="button" class="btn btn-save" onclick={handleSave}>Add to Yard</button>
		</div>
	</div>
</div>

<style>
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.dialog {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		width: 320px;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid #2e2e2e;
	}

	.dialog-title {
		font-size: 13px;
		font-weight: 600;
		color: #e0e0e0;
	}

	.dialog-close {
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		padding: 2px;
	}
	.dialog-close:hover {
		color: #fff;
	}

	.dialog-body {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.field-label {
		font-size: 10px;
		font-weight: 500;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.field-input {
		background: #111;
		border: 1px solid #2e2e2e;
		border-radius: 3px;
		padding: 5px 8px;
		font-size: 12px;
		color: #e0e0e0;
		outline: none;
	}
	.field-input:focus {
		border-color: #4a4a4a;
	}

	select.field-input {
		cursor: pointer;
	}

	.field-toggle {
		align-self: flex-start;
		background: none;
		border: none;
		color: #5588ff;
		font-size: 10px;
		cursor: pointer;
		padding: 0;
	}
	.field-toggle:hover {
		text-decoration: underline;
	}

	.dim-grid {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dim-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.dim-axis {
		font-size: 11px;
		font-weight: 600;
		color: #888;
		width: 14px;
	}

	.dim-value {
		font-size: 11px;
		color: #ccc;
		font-family: monospace;
		flex: 1;
	}

	.dim-fixed-toggle {
		font-size: 10px;
		padding: 2px 8px;
		border-radius: 3px;
		border: 1px solid #2e2e2e;
		cursor: pointer;
		background: #1e1e1e;
		color: #7aff7a;
	}
	.dim-fixed-toggle.active {
		background: #2a2a3a;
		color: #7a7aff;
		border-color: #4a4a6a;
	}

	.color-preview {
		width: 24px;
		height: 24px;
		border-radius: 3px;
		border: 1px solid #2e2e2e;
	}

	.dialog-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid #2e2e2e;
	}

	.btn {
		font-size: 11px;
		padding: 5px 14px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-weight: 500;
	}

	.btn-cancel {
		background: #2a2a2a;
		color: #ccc;
	}
	.btn-cancel:hover {
		background: #333;
	}

	.btn-save {
		background: #3366cc;
		color: #fff;
	}
	.btn-save:hover {
		background: #4477dd;
	}
</style>
