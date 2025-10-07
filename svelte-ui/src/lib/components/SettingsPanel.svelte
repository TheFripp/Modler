<script lang="ts">
	import { onMount } from 'svelte';
	import { toolState } from '$lib/stores/modler';
	import { unifiedCommunication } from '$lib/services/unified-communication';
	import { toggleSnapInScene } from '$lib/bridge/threejs-bridge';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import ColorInput from '$lib/components/ui/color-input.svelte';

	// Settings state
	let visualSettings = {
		selection: {
			color: '#ff6600',
			lineWidth: 2,
			opacity: 80,
			faceHighlightOpacity: 30
		},
		containers: {
			wireframeColor: '#00ff00',
			lineWidth: 1,
			opacity: 80
		}
	};

	let cadWireframeSettings = {
		color: '#888888',
		lineWidth: 1,
		opacity: 50
	};

	let sceneSettings = {
		backgroundColor: '#1a1a1a',
		gridMainColor: '#444444',
		gridSubColor: '#2a2a2a'
	};

	let interfaceSettings = {
		accentColor: '#3b82f6',
		toolbarOpacity: 95
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

	function updateVisualSettings(category: 'selection' | 'containers', property: string, value: any) {
		visualSettings[category][property] = value;

		const configPath = category === 'selection'
			? `visual.selection.${property}`
			: `visual.containers.${property}`;

		const actualValue = (property === 'opacity' || property === 'faceHighlightOpacity') ? value / 100 : value;

		unifiedCommunication.sendVisualSettings('visual', {
			[configPath]: actualValue
		}).catch(console.error);
	}

	function handleSnapToggle() {
		try {
			toggleSnapInScene();
		} catch (error) {
			console.error('❌ Snap toggle failed:', error);
		}
	}

	function selectUnit(unit: string) {
		currentUnit = unit;
		if (unitConverter) {
			unitConverter.setUserUnit(unit);
			window.dispatchEvent(new CustomEvent('unit-changed', { detail: { unit } }));
		}
	}

	function updateCadWireframeSettings(property: string, value: any) {
		cadWireframeSettings[property] = value;
		const configPath = `visual.cad.wireframe.${property}`;
		const actualValue = property === 'opacity' ? value / 100 : value;

		unifiedCommunication.sendVisualSettings('cad-wireframe', {
			[configPath]: actualValue
		}).catch(console.error);
	}

	function updateSceneSettings(property: string, value: any) {
		sceneSettings[property] = value;
		const configPath = `scene.${property}`;

		unifiedCommunication.sendVisualSettings('scene', {
			[configPath]: value
		}).catch(console.error);
	}

	function updateInterfaceSettings(property: string, value: any) {
		interfaceSettings[property] = value;
		const configPath = `interface.${property}`;
		const actualValue = property === 'toolbarOpacity' ? value / 100 : value;

		unifiedCommunication.sendVisualSettings('interface', {
			[configPath]: actualValue
		}).catch(console.error);
	}

	function handleSettingsResponse(event: MessageEvent) {
		if (event.data.type === 'visual-settings-response') {
			const settings = event.data.settings;
			visualSettings = {
				selection: {
					color: settings.selection.color,
					lineWidth: settings.selection.lineWidth,
					opacity: settings.selection.opacity * 100,
					faceHighlightOpacity: (settings.selection.faceHighlightOpacity || 0.3) * 100
				},
				containers: {
					wireframeColor: settings.containers.wireframeColor,
					lineWidth: settings.containers.lineWidth,
					opacity: settings.containers.opacity * 100
				}
			};
		} else if (event.data.type === 'cad-wireframe-settings-response') {
			const settings = event.data.settings;
			cadWireframeSettings = {
				color: settings.color,
				lineWidth: settings.lineWidth,
				opacity: settings.opacity * 100
			};
		} else if (event.data.type === 'scene-settings-response') {
			const settings = event.data.settings;
			sceneSettings = {
				backgroundColor: settings.backgroundColor,
				gridMainColor: settings.gridMainColor,
				gridSubColor: settings.gridSubColor
			};
		} else if (event.data.type === 'interface-settings-response') {
			const settings = event.data.settings;
			interfaceSettings = {
				accentColor: settings.accentColor,
				toolbarOpacity: settings.toolbarOpacity * 100
			};
		}
	}

	function loadSettings() {
		window.parent.postMessage({ type: 'get-visual-settings' }, '*');
		window.parent.postMessage({ type: 'get-cad-wireframe-settings' }, '*');
		window.parent.postMessage({ type: 'get-scene-settings' }, '*');
		window.parent.postMessage({ type: 'get-interface-settings' }, '*');
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
	<!-- Visual Settings -->
	<PropertyGroup title="Visual Settings">
		<!-- Selection -->
		<div class="space-y-2 mb-4">
			<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Selection</h4>
			<ColorInput
				label="Color"
				value={visualSettings.selection.color}
				onchange={(value) => updateVisualSettings('selection', 'color', value)}
			/>
			<div class="flex gap-2">
				<InlineInput
					label="Line Width"
					type="number"
					value={visualSettings.selection.lineWidth}
					objectId={null}
					property="visual.selection.lineWidth"
					min={1}
					max={10}
					step={0.5}
					onchange={(value) => updateVisualSettings('selection', 'lineWidth', value)}
				/>
				<InlineInput
					label="Opacity"
					type="number"
					value={visualSettings.selection.opacity}
					objectId={null}
					property="visual.selection.opacity"
					min={0}
					max={100}
					step={1}
					onchange={(value) => updateVisualSettings('selection', 'opacity', Math.round(value))}
				/>
			</div>
			<InlineInput
				label="Face Opacity"
				type="number"
				value={visualSettings.selection.faceHighlightOpacity}
				objectId={null}
				property="visual.selection.faceHighlightOpacity"
				min={0}
				max={100}
				step={1}
				onchange={(value) => updateVisualSettings('selection', 'faceHighlightOpacity', Math.round(value))}
			/>
		</div>

		<!-- Containers -->
		<div class="space-y-2 mb-4">
			<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Containers</h4>
			<ColorInput
				label="Wireframe"
				value={visualSettings.containers.wireframeColor}
				onchange={(value) => updateVisualSettings('containers', 'wireframeColor', value)}
			/>
			<div class="flex gap-2">
				<InlineInput
					label="Line Width"
					type="number"
					value={visualSettings.containers.lineWidth}
					objectId={null}
					property="visual.containers.lineWidth"
					min={1}
					max={10}
					step={0.5}
					onchange={(value) => updateVisualSettings('containers', 'lineWidth', value)}
				/>
				<InlineInput
					label="Opacity"
					type="number"
					value={visualSettings.containers.opacity}
					objectId={null}
					property="visual.containers.opacity"
					min={0}
					max={100}
					step={1}
					onchange={(value) => updateVisualSettings('containers', 'opacity', Math.round(value))}
				/>
			</div>
		</div>

		<!-- Snapping -->
		<div class="space-y-2 mb-4">
			<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">Snapping</h4>
			<button
				type="button"
				onclick={handleSnapToggle}
				class="w-full px-3 py-2 text-sm rounded-md transition-colors {$toolState.snapEnabled
					? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
					: 'bg-[#2E2E2E] text-foreground/70 border border-[#404040] hover:bg-[#404040]'}"
			>
				{$toolState.snapEnabled ? 'Snap Enabled' : 'Snap Disabled'}
			</button>
		</div>

		<!-- CAD Wireframes -->
		<div class="space-y-2">
			<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-right">CAD Wireframes</h4>
			<ColorInput
				label="Color"
				value={cadWireframeSettings.color}
				onchange={(value) => updateCadWireframeSettings('color', value)}
			/>
			<div class="flex gap-2">
				<InlineInput
					label="Line Width"
					type="number"
					value={cadWireframeSettings.lineWidth}
					objectId={null}
					property="visual.cad.wireframe.lineWidth"
					min={1}
					max={10}
					step={0.5}
					onchange={(value) => updateCadWireframeSettings('lineWidth', value)}
				/>
				<InlineInput
					label="Opacity"
					type="number"
					value={cadWireframeSettings.opacity}
					objectId={null}
					property="visual.cad.wireframe.opacity"
					min={0}
					max={100}
					step={1}
					onchange={(value) => updateCadWireframeSettings('opacity', Math.round(value))}
				/>
			</div>
		</div>
	</PropertyGroup>

	<!-- Scene Settings -->
	<PropertyGroup title="Scene Settings">
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
		</div>
	</PropertyGroup>

	<!-- Interface Settings -->
	<PropertyGroup title="Interface Settings">
		<div class="space-y-2">
			<ColorInput
				label="Accent Color"
				value={interfaceSettings.accentColor}
				onchange={(value) => updateInterfaceSettings('accentColor', value)}
			/>
			<InlineInput
				label="Toolbar Opacity"
				type="number"
				value={interfaceSettings.toolbarOpacity}
				objectId={null}
				property="interface.toolbarOpacity"
				min={0}
				max={100}
				step={1}
				onchange={(value) => updateInterfaceSettings('toolbarOpacity', Math.round(value))}
			/>
		</div>
	</PropertyGroup>

	<!-- System Settings -->
	<PropertyGroup title="System Settings">
		<div class="space-y-2">
			<label class="block text-sm text-foreground/80">Unit System</label>
			<select
				bind:value={currentUnit}
				onchange={() => selectUnit(currentUnit)}
				class="w-full px-3 py-2 bg-[#2E2E2E] border border-[#404040] rounded-md text-sm text-foreground focus:outline-none focus:border-blue-500"
			>
				{#each units as unit}
					<option value={unit.value}>{unit.label}</option>
				{/each}
			</select>
		</div>
	</PropertyGroup>
</div>
