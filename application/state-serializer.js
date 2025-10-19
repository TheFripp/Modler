/**
 * StateSerializer - Complete Object Data Provider
 *
 * CRITICAL: This is where ALL computed properties are defined.
 * Every notification includes complete data so UI never needs to request additional info.
 *
 * Key Principle: "Define attribute in one place"
 * - Each computed property (canHaveFillButtons, isInLayoutMode, etc.) defined ONCE here
 * - Automatically included in every notification
 * - UI never needs to make secondary requests
 *
 * Part of: Communication Simplification (replaces Phase 3)
 * Version: 1.0.0
 * Date: 2025-10-13
 */

class StateSerializer {
    constructor() {
        this.initialized = false;

        // Component references (initialized lazily)
        this.objectStateManager = null;
        this.sceneController = null;
        this.objectDataFormat = null;

        // Statistics for debugging
        this.stats = {
            serializations: 0,
            hierarchySerializations: 0,
            errors: 0
        };
    }

    /**
     * Initialize component references
     * CRITICAL: This is called lazily on each request, not just once at startup
     */
    initializeComponents() {
        if (this.initialized) return true; // Already initialized successfully

        const components = window.modlerComponents;

        if (!components) {
            // Listen for modlerV2Ready event to re-initialize components
            // Use { once: true } to ensure we only listen once
            if (!this._modlerV2ReadyListenerAdded) {
                this._modlerV2ReadyListenerAdded = true;
                window.addEventListener('modlerV2Ready', () => {
                    this.initializeComponents();

                    // After successful initialization, resend hierarchy to UI
                    if (this.initialized && window.simpleCommunication) {
                        window.simpleCommunication.sendInitialHierarchySync(this);
                    }
                }, { once: true });
            }

            return false;
        }

        this.objectStateManager = components.objectStateManager;
        this.sceneController = components.sceneController;
        this.objectDataFormat = window.ObjectDataFormat;

        if (!this.objectStateManager || !this.sceneController || !this.objectDataFormat) {
            return false;
        }

        this.initialized = true;
        return true;
    }

    /**
     * Get COMPLETE object data with all computed properties
     * This is the PRIMARY method - UI receives this data and never needs to request more
     *
     * @param {string} objectId - Object ID
     * @returns {Object|null} Complete object data with all computed properties
     */
    getCompleteObjectData(objectId) {
        if (!this.initializeComponents()) {
            return null;
        }

        try {
            // Get base data from SceneController (the actual source of truth for geometry)
            const baseData = this.sceneController.getObject(objectId);
            if (!baseData) {
                return null;
            }

            // Standardize through ObjectDataFormat
            const standardData = this.objectDataFormat.standardizeObjectData(baseData);

            // Enrich with ALL computed properties
            const completeData = {
                ...standardData,

                // ═══════════════════════════════════════════════════════
                // COMPUTED UI PROPERTIES (defined ONCE, used everywhere)
                // ═══════════════════════════════════════════════════════

                // Fill button properties
                canHaveFillButtons: this.computeCanHaveFillButtons(objectId),
                fillButtonStates: this.computeFillButtonStates(objectId),

                // Layout properties
                isInLayoutMode: this.computeIsInLayoutMode(objectId),

                // Container properties
                isHugMode: this.computeIsHugMode(objectId),

                // ═══════════════════════════════════════════════════════
                // CONTEXT DATA (parent, children)
                // ═══════════════════════════════════════════════════════

                // Parent context (lighter data for parent)
                parentData: baseData.parentContainer ?
                    this.getParentData(baseData.parentContainer) : null,

                // Children context (basic data for children list)
                childrenData: baseData.childIds && baseData.childIds.length > 0 ?
                    baseData.childIds.map(id => this.getBasicObjectData(id)).filter(Boolean) : [],

                // ═══════════════════════════════════════════════════════
                // TOOL & ACTION AVAILABILITY
                // ═══════════════════════════════════════════════════════

                availableTools: this.computeAvailableTools(objectId),

                // Action permissions
                canDelete: this.computeCanDelete(objectId),
                canDuplicate: this.computeCanDuplicate(objectId),
                canMove: this.computeCanMove(objectId),
                canResize: this.computeCanResize(objectId),
                canRotate: this.computeCanRotate(objectId),

                // ═══════════════════════════════════════════════════════
                // METADATA
                // ═══════════════════════════════════════════════════════

                serializedAt: Date.now(),
                serializerVersion: '1.0.0'
            };

            this.stats.serializations++;
            return completeData;

        } catch (error) {
            console.error('StateSerializer: Failed to serialize object', objectId, error);
            this.stats.errors++;
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // COMPUTED PROPERTY DEFINITIONS
    // Each property defined ONCE here, automatically included in all notifications
    // ═══════════════════════════════════════════════════════════════

    /**
     * Compute whether this object can have fill buttons
     *
     * DEFINITION: Fill buttons are available when:
     * - Object is NOT a container
     * - Object HAS a parent container
     * - Parent is in layout mode
     * - Object is not locked
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanHaveFillButtons(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        if (!obj || obj.isContainer || obj.locked) {
            return false;
        }

        if (!obj.parentContainer) {
            return false;
        }

        const parent = this.objectStateManager.getObject(obj.parentContainer);
        return parent && parent.layoutMode !== null && parent.layoutMode !== undefined;
    }

    /**
     * Compute fill button states for each axis
     *
     * DEFINITION: Fill button is active when layoutProperties[axis] === 'fill'
     *
     * @param {string} objectId
     * @returns {Object} {x: boolean, y: boolean, z: boolean}
     */
    computeFillButtonStates(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        if (!obj || !obj.layoutProperties) {
            return { x: false, y: false, z: false };
        }

        return {
            x: obj.layoutProperties.sizeX === 'fill',
            y: obj.layoutProperties.sizeY === 'fill',
            z: obj.layoutProperties.sizeZ === 'fill'
        };
    }

    /**
     * Compute whether this object is in layout mode
     *
     * DEFINITION: Layout mode active when object is container AND layoutMode is set
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeIsInLayoutMode(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj && obj.isContainer && obj.layoutMode !== null && obj.layoutMode !== undefined;
    }

    /**
     * Compute whether this object is in hug mode
     *
     * DEFINITION: Hug mode active when isHug flag is true
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeIsHugMode(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj && obj.isHug === true;
    }

    /**
     * Compute available tools for this object
     *
     * @param {string} objectId
     * @returns {Array<string>}
     */
    computeAvailableTools(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        if (!obj) return [];

        const tools = ['select', 'delete'];

        if (!obj.locked) {
            tools.push('move', 'push');

            if (!obj.isContainer) {
                tools.push('rotate');
            }
        }

        if (obj.isContainer) {
            tools.push('add-to-container');
        }

        return tools;
    }

    /**
     * Compute whether object can be deleted
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanDelete(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj && !obj.locked;
    }

    /**
     * Compute whether object can be duplicated
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanDuplicate(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj !== null;
    }

    /**
     * Compute whether object can be moved
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanMove(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj && !obj.locked;
    }

    /**
     * Compute whether object can be resized
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanResize(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        if (!obj || obj.locked) return false;

        // Can't resize if in fill mode on any axis
        if (obj.layoutProperties) {
            const hasAnyFill = obj.layoutProperties.sizeX === 'fill' ||
                              obj.layoutProperties.sizeY === 'fill' ||
                              obj.layoutProperties.sizeZ === 'fill';
            if (hasAnyFill) return false;
        }

        return true;
    }

    /**
     * Compute whether object can be rotated
     *
     * @param {string} objectId
     * @returns {boolean}
     */
    computeCanRotate(objectId) {
        const obj = this.objectStateManager.getObject(objectId);
        return obj && !obj.locked && !obj.isContainer;
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get basic object data (lighter version for children lists)
     *
     * @param {string} objectId
     * @returns {Object|null}
     */
    getBasicObjectData(objectId) {
        // CRITICAL: Read from SceneController (single source of truth for hierarchy)
        const obj = this.sceneController.getObject(objectId);
        if (!obj) return null;

        return {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            isContainer: obj.isContainer,
            parentContainer: obj.parentContainer || null, // Critical for ObjectTree to build hierarchy
            selected: obj.selected,
            locked: obj.locked,
            visible: obj.visible
        };
    }

    /**
     * Get parent data (includes computed properties parent needs)
     *
     * @param {string} parentId
     * @returns {Object|null}
     */
    getParentData(parentId) {
        const parent = this.objectStateManager.getObject(parentId);
        if (!parent) return null;

        return {
            id: parent.id,
            name: parent.name,
            type: parent.type,
            isContainer: parent.isContainer,
            layoutMode: parent.layoutMode,
            autoLayout: parent.autoLayout,
            isHug: parent.isHug,

            // Computed properties for parent
            isInLayoutMode: this.computeIsInLayoutMode(parentId)
        };
    }

    /**
     * Get complete hierarchy as flat array (for ObjectTree panel)
     *
     * Returns ALL objects as a flat array with parentContainer references.
     * ObjectTree builds the tree structure itself using these references.
     *
     * @returns {Array<Object>}
     */
    getCompleteHierarchy() {
        if (!this.initializeComponents()) {
            return [];
        }

        try {
            // Get ALL objects as flat array (not just roots)
            const allObjects = this.sceneController.getAllObjects();


            // Map to basic object data (includes parentContainer for tree building)
            const hierarchy = allObjects
                .map(obj => this.getBasicObjectData(obj.id))
                .filter(Boolean);

            this.stats.hierarchySerializations++;
            return hierarchy;

        } catch (error) {
            console.error('StateSerializer: Failed to serialize hierarchy', error);
            this.stats.errors++;
            return [];
        }
    }

    /**
     * Get statistics
     *
     * @returns {Object}
     */
    getStats() {
        return { ...this.stats };
    }
}

// Export singleton instance
window.StateSerializer = StateSerializer;
window.stateSerializer = new StateSerializer();
