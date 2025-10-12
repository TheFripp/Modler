<script lang="ts">
	import { onMount } from 'svelte';
	import { unifiedCommunication } from '$lib/services/unified-communication';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import ColorInput from '$lib/components/ui/color-input.svelte';

	// Settings state
	let visualSettings = {
		object: {
			outlineColor: '#888888',
			selectionColor: '#ff6600',
			lineWidth: 2,
			opacity: 80,
			faceHighlightOpacity: 30
		},
		container: {
			selectionColor: '#00ff00',
			lineWidth: 1,
			opacity: 80,
			faceHighlightOpacity: 30
		}
	};

	let sceneSettings = {
		backgroundColor: '#1a1a1a',
		gridMainColor: '#444444',
		gridSubColor: '#2a2a2a'
	};

	let toolSettings = {
		measurementColor: '#ff0000'
	};

	let currentUnit = 'm';
	let unitConverter: any = null;

	const units = [
		{ value: 'm', label: 'Meters (m)' },
		{ value: 'cm', label: 'Centimeters (cm)' },
		{ value: 'mm', label: 'Millimeters (mm)' },
		{ value: 'in', label: 'Inches (in)' },
		{ value: 'ft', label: 'Feet (ft)' }
	];

	function updateVisualSettings(category: 'object' | 'container', property: string, value: any) {
		visualSettings[category][property] = value;

		// Map to old config paths for backward compatibility
		let configPath: string;
		if (category === 'object') {
			if (property === 'outlineColor') {
				configPath = 'visual.cad.wireframe.color';
			} else if (property === 'selectionColor') {
				configPath = 'visual.selection.color';
			} else {
				configPath = `visual.selection.${property}`;
			}
		} else {
			if (property === 'selectionColor') {
				configPath = 'visual.containers.wireframeColor';
			} else {
				configPath = `visual.containers.${property}`;
			}
		}

		const actualValue = (property === 'opacity' || property === 'faceHighlightOpacity') ? value / 100 : value;

		unifiedCommunication.sendVisualSettings('visual', {
			[configPath]: actualValue
		}).catch(console.error);
	}

	function selectUnit(unit: string) {
		currentUnit = unit;
		if (unitConverter) {
			unitConverter.setUserUnit(unit);
			window.dispatchEvent(new CustomEvent('unit-changed', { detail: { unit } }));
		}
	}

	function updateSceneSettings(property: string, value: any) {
		sceneSettings[property] = value;
		const configPath = `scene.${property}`;

		unifiedCommunication.sendVisualSettings('scene', {
			[configPath]: value
		}).catch(console.error);
	}

	function updateToolSettings(property: string, value: any) {
		toolSettings[property] = value;
		const configPath = `visual.measurement.${property === 'measurementColor' ? 'color' : property}`;

		unifiedCommunication.sendVisualSettings('visual', {
			[configPath]: value
		}).catch(console.error);
	}

	function handleSettingsResponse(event: MessageEvent) {
		if (event.data.type === 'visual-settings-response') {
			const settings = event.data.settings;
			visualSettings = {
				object: {
					outlineColor: settings.cad?.wireframe?.color || '#888888',
					selectionColor: settings.selection?.color || '#ff6600',
					lineWidth: settings.selection?.lineWidth || 2,
					opacity: (settings.selection?.opacity || 0.8) * 100,
					faceHighlightOpacity: (settings.selection?.faceHighlightOpacity || 0.3) * 100
				},
				container: {
					selectionColor: settings.containers?.wireframeColor || '#00ff00',
					lineWidth: settings.containers?.lineWidth || 1,
					opacity: (settings.containers?.opacity || 0.8) * 100,
					faceHighlightOpacity: (settings.containers?.faceHighlightOpacity || 0.3) * 100
				}
			};
		} else if (event.data.type === 'scene-settings-response') {
			const settings = event.data.settings;
			sceneSettings = {
				backgroundColor: settings.backgroundColor,
				gridMainColor: settings.gridMainColor,
				gridSubColor: settings.gridSubColor
			};
		}
	}

	function loadSettings() {
		window.parent.postMessage({ type: 'get-visual-settings' }, '*');
		window.parent.postMessage({ type: 'get-scene-settings' }, '*');
	}

	onMount(() => {
		unitConverter = (window as any).UnitConverter ? new (window as any).UnitConverter() : null;
		if (unitConverter) {
			currentUnit = unitConverter.userUnit;
		}

		window.addEventListener('message', handleSettingsResponse);
		loadSettings();

		return () => {
			window.removeEventListener('message', handleSettingsResponse);
		};
	});

	// Reload settings when component becomes visible
	export function reload() {
		loadSettings();
	}
</script>

<div class="h-full overflow-y-auto px-4 py-4 space-y-4">
	<!-- Visuals -->
	<PropertyGroup title="Visuals" align="left">
		<!-- Object -->
		<div class="space-y-2 mb-8">
			<div class="flex items-center gap-2 mb-2">
				<h4 class="modler-property-label opacity-70 whitespace-nowrap">Object</h4>
				<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
			</div>
			<ColorInput
				label="Outline"
				value={visualSettings.object.outlineColor}
				onchange={(value) => updateVisualSettings('object', 'outlineColor', value)}
			/>
			<div class="flex gap-2">
				<div style="flex: 0 1 200px; min-width: 0;">
					<ColorInput
						label="Selection"
						value={visualSettings.object.selectionColor}
						onchange={(value) => updateVisualSettings('object', 'selectionColor', value)}
					/>
				</div>
				<div class="w-20 flex-shrink-0">
					<InlineInput
						label=""
						type="number"
						value={visualSettings.object.faceHighlightOpacity}
						objectId={null}
						property="visual.selection.faceHighlightOpacity"
						min={0}
						max={100}
						step={1}
						suffix="%"
						onchange={(event) => {
							const numValue = parseFloat((event.target as HTMLInputElement).value);
							updateVisualSettings('object', 'faceHighlightOpacity', Math.round(numValue));
						}}
					/>
				</div>
			</div>
		</div>

		<!-- Container -->
		<div class="space-y-2">
			<div class="flex items-center gap-2 mb-2">
				<h4 class="modler-property-label opacity-70 whitespace-nowrap">Container</h4>
				<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
			</div>
			<div class="flex gap-2">
				<div style="flex: 0 1 200px; min-width: 0;">
					<ColorInput
						label="Selection"
						value={visualSettings.container.selectionColor}
						onchange={(value) => updateVisualSettings('container', 'selectionColor', value)}
					/>
				</div>
				<div class="w-20 flex-shrink-0">
					<InlineInput
						label=""
						type="number"
						value={visualSettings.container.faceHighlightOpacity}
						objectId={null}
						property="visual.containers.faceHighlightOpacity"
						min={0}
						max={100}
						step={1}
						suffix="%"
						onchange={(event) => {
							const numValue = parseFloat((event.target as HTMLInputElement).value);
							updateVisualSettings('container', 'faceHighlightOpacity', Math.round(numValue));
						}}
					/>
				</div>
			</div>
		</div>

		<!-- Measurement Tool -->
		<div class="space-y-2 mt-8">
			<div class="flex items-center gap-2 mb-2">
				<h4 class="modler-property-label opacity-70 whitespace-nowrap">Measurement Tool</h4>
				<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
			</div>
			<ColorInput
				label="Color"
				value={toolSettings.measurementColor}
				onchange={(value) => updateToolSettings('measurementColor', value)}
			/>
		</div>
	</PropertyGroup>

	<!-- Scene -->
	<PropertyGroup title="Scene" align="left">
		<div class="space-y-2">
			<ColorInput
				label="Background"
				value={sceneSettings.backgroundColor}
				onchange={(value) => updateSceneSettings('backgroundColor', value)}
			/>
			<ColorInput
				label="Grid Main"
				value={sceneSettings.gridMainColor}
				onchange={(value) => updateSceneSettings('gridMainColor', value)}
			/>
			<ColorInput
				label="Grid Sub"
				value={sceneSettings.gridSubColor}
				onchange={(value) => updateSceneSettings('gridSubColor', value)}
			/>

			<div class="flex items-center gap-2 pt-2 mb-2">
				<h4 class="modler-property-label opacity-70 whitespace-nowrap">Units</h4>
				<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
			</div>
			<select
				bind:value={currentUnit}
				onchange={() => selectUnit(currentUnit)}
				class="w-full h-8 px-3 pr-8 bg-[#212121]/50 border border-[#2E2E2E]/50 rounded-md text-xs text-foreground focus:outline-none focus:border-[#6b7280] transition-colors appearance-none"
				style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2210%22%20height%3D%225%22%20viewBox%3D%220%200%2010%205%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M0%200l5%205%205-5z%22/%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 8px 4px;"
			>
				{#each units as unit}
					<option value={unit.value}>{unit.label}</option>
				{/each}
			</select>
		</div>
	</PropertyGroup>
</div>
