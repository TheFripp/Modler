/**
 * PushContainerTransitions - Container transition logic for PushTool
 *
 * Extracted from PushTool to separate container-aware behaviors
 * (hug→layout transition, fill mode, tile sync) from core push geometry.
 */

class PushContainerTransitions {
    /**
     * Transition a hug-mode container to layout mode when push begins.
     * Sets layout direction to push axis and enables fill on all children.
     * @returns {Object} hugTransitionState for undo capture
     */
    static transitionHugToLayout(objectData, pushAxis, sceneController, objectStateManager) {
        if (!sceneController || !objectStateManager) return null;

        const children = sceneController.getChildObjects(objectData.id);
        const childStates = {};
        children.forEach(child => {
            childStates[child.id] = {
                originalLayoutProperties: child.layoutProperties
                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                    : null
            };
        });

        const hugTransitionState = {
            containerId: objectData.id,
            originalAutoLayout: JSON.parse(JSON.stringify(objectData.autoLayout || {})),
            childStates: childStates
        };

        // Transition container: hug → layout
        const baseAutoLayout = objectData.autoLayout || window.ObjectDataFormat.createDefaultAutoLayout();
        objectStateManager.updateObject(objectData.id, {
            ...ObjectStateManager.buildContainerModeUpdate('layout'),
            autoLayout: {
                ...baseAutoLayout,
                enabled: true,
                direction: pushAxis
            }
        }, 'push-tool');

        // Set all children to fill on the push axis
        const fillProperty = `size${pushAxis.toUpperCase()}`;
        children.forEach(child => {
            const currentLP = child.layoutProperties || {
                sizeX: 'fixed', sizeY: 'fixed', sizeZ: 'fixed',
                fixedSize: { x: null, y: null, z: null }
            };
            const fixedSize = { ...(currentLP.fixedSize || { x: null, y: null, z: null }) };
            fixedSize[pushAxis] = child.dimensions?.[pushAxis] || null;

            objectStateManager.updateObject(child.id, {
                layoutProperties: {
                    ...currentLP,
                    [fillProperty]: 'fill',
                    fixedSize: fixedSize
                }
            }, 'push-tool');
        });

        // Run initial layout — pushContext skips container resize block
        sceneController.updateContainer(objectData.id, { pushContext: { axis: pushAxis } });

        return hugTransitionState;
    }

    /**
     * Set children to fill on a specific axis (perpendicular push).
     * @returns {Object} fillTransitionState for undo capture
     */
    static setChildrenToFillOnAxis(objectData, axis, sceneController, objectStateManager) {
        if (!sceneController || !objectStateManager) return null;

        const children = sceneController.getChildObjects(objectData.id);
        const fillProperty = `size${axis.toUpperCase()}`;

        const childStates = {};
        children.forEach(child => {
            childStates[child.id] = {
                originalLayoutProperties: child.layoutProperties
                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                    : null
            };
        });

        const fillTransitionState = {
            containerId: objectData.id,
            childStates: childStates
        };

        children.forEach(child => {
            const currentLP = child.layoutProperties || {
                sizeX: 'fixed', sizeY: 'fixed', sizeZ: 'fixed',
                fixedSize: { x: null, y: null, z: null }
            };
            if (currentLP[fillProperty] !== 'fill') {
                const fixedSize = { ...(currentLP.fixedSize || { x: null, y: null, z: null }) };
                fixedSize[axis] = child.dimensions?.[axis] || null;

                objectStateManager.updateObject(child.id, {
                    layoutProperties: {
                        ...currentLP,
                        [fillProperty]: 'fill',
                        fixedSize: fixedSize
                    }
                }, 'push-tool');
            }
        });

        // Run layout — pushContext skips container resize block
        sceneController.updateContainer(objectData.id, { pushContext: { axis } });

        return fillTransitionState;
    }

    /**
     * Sync tile siblings to match pushed child's dimensions.
     */
    static syncTileSiblings(pushedObjectData, container, sceneController, objectStateManager) {
        const dimensionManager = window.dimensionManager;
        if (!dimensionManager || !objectStateManager) return;

        const sourceDims = dimensionManager.getDimensions(pushedObjectData.mesh);
        if (!sourceDims) return;

        const siblings = sceneController.getAllObjects()
            .filter(obj => obj.parentContainer === container.id && obj.id !== pushedObjectData.id);

        for (const sibling of siblings) {
            dimensionManager.setDimensions(sibling.mesh, sourceDims, 'center');
            objectStateManager.updateObject(sibling.id, {
                dimensions: { ...sourceDims }
            }, 'push-tool');
        }
    }

    /**
     * Sync all tile children to match the pushed container's perpendicular dimension.
     */
    static syncTileChildrenToContainer(containerData, syncAxis, sceneController, objectStateManager) {
        const dimensionManager = window.dimensionManager;
        if (!dimensionManager || !objectStateManager) return;

        const containerDims = dimensionManager.getDimensions(containerData.mesh);
        if (!containerDims) return;

        const padding = containerData.autoLayout?.padding || {};
        const paddingKey = { x: 'width', y: 'height', z: 'depth' }[syncAxis];
        const paddingVal = (padding[paddingKey] || 0) * 2;

        const targetDim = containerDims[syncAxis] - paddingVal;
        if (targetDim <= 0) return;

        const children = sceneController.getChildObjects(containerData.id);
        for (const child of children) {
            const currentDims = dimensionManager.getDimensions(child.mesh);
            if (!currentDims) continue;

            const newDims = { ...currentDims, [syncAxis]: targetDim };
            dimensionManager.setDimensions(child.mesh, newDims, 'center');
            objectStateManager.updateObject(child.id, {
                dimensions: newDims
            }, 'push-tool');
        }
    }
}

window.PushContainerTransitions = PushContainerTransitions;
