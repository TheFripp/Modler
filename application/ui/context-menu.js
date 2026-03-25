/**
 * ContextMenu — Right-click context menu overlay
 *
 * Positioned DOM overlay on the main canvas. Dark themed.
 * Shows object-specific actions based on what was right-clicked.
 */

class ContextMenu {
    constructor() {
        this.menuEl = null;
        this.visible = false;
        this.currentObjectData = null;

        this._handleClickOutside = this._handleClickOutside.bind(this);
        this._handleEscape = this._handleEscape.bind(this);

        this._createDOM();
    }

    _createDOM() {
        this.menuEl = document.createElement('div');
        this.menuEl.className = 'modler-context-menu';
        this.menuEl.style.cssText = `
            position: fixed;
            z-index: 100000;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 4px 0;
            min-width: 180px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            display: none;
            user-select: none;
        `;
        document.body.appendChild(this.menuEl);
    }

    show(x, y, objectData) {
        this.currentObjectData = objectData;

        // Build menu items
        this.menuEl.innerHTML = '';
        const items = this._getMenuItems(objectData);

        for (const item of items) {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background: #2e2e2e; margin: 4px 0;';
                this.menuEl.appendChild(sep);
                continue;
            }

            const el = document.createElement('div');
            el.textContent = item.label;
            el.style.cssText = `
                padding: 6px 14px;
                color: #ddd;
                cursor: pointer;
                transition: background 0.1s;
            `;
            el.addEventListener('mouseenter', () => {
                el.style.background = '#2a2a2a';
            });
            el.addEventListener('mouseleave', () => {
                el.style.background = 'none';
            });
            el.addEventListener('click', () => {
                this.hide();
                item.action(objectData);
            });
            this.menuEl.appendChild(el);
        }

        // Position: keep within viewport
        this.menuEl.style.display = 'block';
        const rect = this.menuEl.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 8;
        const maxY = window.innerHeight - rect.height - 8;
        this.menuEl.style.left = `${Math.min(x, maxX)}px`;
        this.menuEl.style.top = `${Math.min(y, maxY)}px`;

        this.visible = true;

        // Delayed listeners to avoid immediate close
        requestAnimationFrame(() => {
            document.addEventListener('mousedown', this._handleClickOutside);
            document.addEventListener('keydown', this._handleEscape);
        });
    }

    hide() {
        if (!this.visible) return;

        this.menuEl.style.display = 'none';
        this.visible = false;
        this.currentObjectData = null;

        document.removeEventListener('mousedown', this._handleClickOutside);
        document.removeEventListener('keydown', this._handleEscape);
    }

    _handleClickOutside(e) {
        if (!this.menuEl.contains(e.target)) {
            this.hide();
        }
    }

    _handleEscape(e) {
        if (e.key === 'Escape') {
            this.hide();
        }
    }

    _getMenuItems(objectData) {
        const items = [];

        // Add to Yard
        items.push({
            label: 'Add to Yard',
            action: (obj) => this._addToYard(obj)
        });

        return items;
    }

    _addToYard(objectData) {
        // Extract relevant data for the yard dialog
        const sceneController = window.modlerComponents?.sceneController;
        const dimensionManager = window.modlerComponents?.dimensionManager || window.dimensionManager;

        let dimensions = objectData.dimensions || { x: 0.1, y: 0.1, z: 0.1 };
        let materialData = { color: '#888888', opacity: 1, transparent: false };

        // Read fresh dimensions from mesh geometry
        if (objectData.mesh && dimensionManager) {
            const dims = dimensionManager.getDimensions(objectData.mesh);
            if (dims) {
                dimensions = { x: dims.x, y: dims.y, z: dims.z };
            }
        }

        // Read material from mesh
        if (objectData.mesh?.material) {
            const mat = objectData.mesh.material;
            const hex = typeof mat.color?.getHex === 'function'
                ? `#${mat.color.getHex().toString(16).padStart(6, '0')}`
                : '#888888';
            materialData = {
                color: hex,
                opacity: mat.opacity ?? 1,
                transparent: mat.transparent ?? false
            };
        }

        // Send to left panel to open the Add to Yard dialog
        if (window.simpleCommunication) {
            window.simpleCommunication.sendToAllIframes({
                type: 'show-add-to-yard-dialog',
                data: {
                    name: objectData.name || 'Object',
                    dimensions,
                    material: materialData
                }
            });
        }
    }
}

window.ContextMenu = ContextMenu;
