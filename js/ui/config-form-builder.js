// Configuration form builder to eliminate repetitive HTML
class ConfigFormBuilder {
    constructor() {
        this.configSections = {
            'Visual': {
                'Selection': {
                    'Color': { type: 'color', id: 'config-selection-color', value: '#ff6600' },
                    'Line Width': { type: 'range', id: 'config-selection-linewidth', min: 1, max: 5, step: 1, value: 2 },
                    'Opacity': { type: 'range', id: 'config-selection-opacity', min: 0.1, max: 1.0, step: 0.1, value: 0.8 },
                    'Face Highlight Opacity': { type: 'range', id: 'config-effects-face-opacity', min: 0.1, max: 1.0, step: 0.1, value: 0.6 }
                },
                'Effects': {
                    'Axis Highlight Color': { type: 'color', id: 'config-effects-axis-color', value: '#ff6600' },
                    'Axis Highlight Opacity': { type: 'range', id: 'config-effects-axis-opacity', min: 0.1, max: 1.0, step: 0.1, value: 0.6 },
                    'Wireframe Line Width': { type: 'range', id: 'config-effects-wireframe-linewidth', min: 1, max: 5, step: 1, value: 2 },
                    'Preview Line Width': { type: 'range', id: 'config-effects-preview-linewidth', min: 1, max: 5, step: 1, value: 2 }
                },
                'Containers': {
                    'Color': { type: 'color', id: 'config-container-color', value: '#00ff00' },
                    'Box Creation Color': { type: 'color', id: 'config-box-creation-color', value: '#00ff00' },
                    'Line Width': { type: 'range', id: 'config-container-linewidth', min: 1, max: 5, step: 1, value: 1 },
                    'Opacity': { type: 'range', id: 'config-container-opacity', min: 0.1, max: 1.0, step: 0.1, value: 0.8 }
                },
                'Snapping': {
                    'Color': { type: 'color', id: 'config-snap-color', value: '#ffffff' },
                    'Corner Size': { type: 'range', id: 'config-snap-cornersize', min: 0.05, max: 0.3, step: 0.05, value: 0.1 },
                    'Border Width': { type: 'range', id: 'config-snap-borderwidth', min: 1, max: 5, step: 1, value: 2 }
                }
            },
            'Scene': {
                'Environment': {
                    'Background Color': { type: 'color', id: 'config-scene-background', value: '#1a1a1a' },
                    'Grid Size': { type: 'range', id: 'config-scene-gridsize', min: 10, max: 50, step: 5, value: 20 },
                    'Grid Density': { type: 'range', id: 'config-scene-griddensity', min: 10, max: 50, step: 5, value: 20 },
                    'Grid Main Color': { type: 'color', id: 'config-scene-gridmain', value: '#444444' },
                    'Grid Sub Color': { type: 'color', id: 'config-scene-gridsub', value: '#222222' }
                }
            },
            'Interface': {
                'UI': {
                    'Accent Color': { type: 'color', id: 'config-ui-accent', value: '#4a9eff' },
                    'Toolbar Opacity': { type: 'range', id: 'config-ui-toolbaropacity', min: 0.5, max: 1.0, step: 0.05, value: 0.95 }
                }
            },
            'Effects': {
                'Advanced': {
                    'Face Render Order': { type: 'range', id: 'config-effects-face-renderorder', min: 500, max: 1500, step: 50, value: 1000 },
                    'Object Edge Color': { type: 'color', id: 'config-effects-object-color', value: '#ff6600' },
                    'Object Edge Opacity': { type: 'range', id: 'config-effects-object-opacity', min: 0.1, max: 1.0, step: 0.1, value: 0.9 },
                    'Object Edge Width': { type: 'range', id: 'config-effects-object-linewidth', min: 1, max: 5, step: 1, value: 2 }
                }
            }
        };
    }

    buildFormHTML() {
        let html = '';

        for (const [categoryName, subcategories] of Object.entries(this.configSections)) {
            html += `<div class="config-category">`;
            html += `<h4>${categoryName}</h4>`;

            for (const [subcategoryName, fields] of Object.entries(subcategories)) {
                if (Object.keys(subcategories).length > 1) {
                    html += `<div class="config-category">`;
                    html += `<h4>${subcategoryName}</h4>`;
                }

                for (const [fieldName, config] of Object.entries(fields)) {
                    html += this.buildFieldHTML(fieldName, config);
                }

                if (Object.keys(subcategories).length > 1) {
                    html += `</div>`;
                }
            }

            html += `</div>`;
        }

        return html;
    }

    buildFieldHTML(label, config) {
        let html = `<div class="config-group">`;
        html += `<label class="config-label">${label}</label>`;

        if (config.type === 'color') {
            html += `<input type="color" class="config-input" id="${config.id}" value="${config.value}">`;
        } else if (config.type === 'range') {
            html += `<input type="range" class="config-slider" id="${config.id}" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.value}">`;
            html += `<span class="config-value">${config.value}</span>`;
        }

        html += `</div>`;
        return html;
    }

    generateContent() {
        return this.buildFormHTML();
    }
}

// Export for use by settings-content.js
window.ConfigFormBuilder = ConfigFormBuilder;