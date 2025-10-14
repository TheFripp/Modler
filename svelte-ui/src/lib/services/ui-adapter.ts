/**
 * UI Adapter - Integrates Communication Bridge with Svelte UI
 *
 * Responsibilities:
 * - Receive postMessages from Main window
 * - Route messages to Svelte stores
 * - Send messages to Main via postMessage
 * - Handle responses from Main
 * - Integrate with existing UI state management
 *
 * Replaces: UnifiedCommunication receiving logic + PropertyController partial
 *
 * Version: 1.0.0
 * Part of: Phase 3 - Communication Layer Consolidation
 */

import { get } from 'svelte/store';
import { selectedObjects, selectedObject, objectHierarchy, toolState } from '$lib/stores/modler';

// Message protocol types (will be loaded from window)
type Message = any;
type MessageProtocol = any;

class UIAdapter {
    private bridge: any = null;
    private initialized: boolean = false;
    private messageListener: ((event: MessageEvent) => void) | null = null;

    // Statistics
    private stats = {
        messagesReceived: 0,
        messagesSent: 0,
        storeUpdates: 0,
        requestsHandled: 0
    };

    /**
     * Set bridge reference (called by CommunicationBridge)
     */
    setBridge(bridge: any): void {
        this.bridge = bridge;
    }

    /**
     * Initialize and set up postMessage listener
     */
    initialize(): boolean {
        if (this.initialized) {
            console.warn('UIAdapter already initialized');
            return false;
        }

        // Set up postMessage listener
        this.messageListener = (event: MessageEvent) => {
            this.handlePostMessage(event);
        };

        window.addEventListener('message', this.messageListener);

        this.initialized = true;
        console.log('✅ UIAdapter initialized');
        return true;
    }

    /**
     * Handle incoming postMessage from Main window
     * @private
     */
    private handlePostMessage(event: MessageEvent): void {
        // Security check - verify origin if needed
        // if (event.origin !== expectedOrigin) return;

        // Check if this is a Message Protocol message
        if (!event.data || !event.data.type || !event.data.id) {
            return; // Not a protocol message, ignore
        }

        this.stats.messagesReceived++;

        try {
            // Deserialize message
            const MessageProtocol = (window as any).MessageProtocol;
            if (!MessageProtocol) {
                console.error('❌ MessageProtocol not loaded');
                return;
            }

            const message = MessageProtocol.Message.deserialize(event.data);

            // Phase 3 FIX: Directly handle message instead of routing through bridge
            // The bridge is for coordinating TWO adapters in the same window
            // Here, postMessage IS the bridge between windows, so directly deliver
            this.receive(message);

        } catch (error) {
            console.error('❌ UIAdapter postMessage error:', error);
        }
    }

    /**
     * Send message through bridge to Main
     */
    send(message: Message): boolean {
        if (!this.bridge) {
            console.error('❌ UIAdapter: Bridge not set');
            return false;
        }

        const sent = this.bridge.sendToMain(message);
        if (sent) {
            this.stats.messagesSent++;
        }
        return sent;
    }

    /**
     * Send message directly via postMessage (low-level)
     * Called by CommunicationBridge when routing to UI
     */
    sendViaPostMessage(message: Message): void {
        try {
            const serialized = message.serialize();
            window.parent.postMessage(serialized, '*');
        } catch (error) {
            console.error('❌ UIAdapter postMessage send error:', error);
        }
    }

    /**
     * Receive message from bridge (Main → UI)
     * Routes to appropriate store updates
     */
    receive(message: Message): void {
        const MessageProtocol = (window as any).MessageProtocol;

        // Route based on message type
        switch (message.type) {
            case MessageProtocol.MESSAGE_TYPES.STATE_CHANGED:
                this.handleStateChangedMessage(message);
                break;

            case MessageProtocol.MESSAGE_TYPES.SELECTION_CHANGED:
                this.handleSelectionChangedMessage(message);
                break;

            case MessageProtocol.MESSAGE_TYPES.HIERARCHY_UPDATED:
                this.handleHierarchyUpdatedMessage(message);
                break;

            case MessageProtocol.MESSAGE_TYPES.GEOMETRY_UPDATED:
                this.handleGeometryUpdatedMessage(message);
                break;

            case MessageProtocol.MESSAGE_TYPES.TOOL_STATE_CHANGED:
                this.handleToolStateChangedMessage(message);
                break;

            default:
                console.warn('UIAdapter: Unknown message type:', message.type);
        }
    }

    /**
     * Handle state changed messages
     * @private
     */
    private handleStateChangedMessage(message: Message): void {
        const { objectId, changes, eventType, objectData } = message.payload;

        // Handle lifecycle events (created, deleted)
        if (eventType === 'created' && objectData) {
            // Add new object to hierarchy
            objectHierarchy.update(hierarchy => {
                const exists = hierarchy.some(obj => obj.id === objectId);
                if (!exists) {
                    return [...hierarchy, objectData];
                }
                return hierarchy;
            });
            this.stats.storeUpdates++;
            return;
        }

        if (eventType === 'deleted') {
            // Remove object from hierarchy
            objectHierarchy.update(hierarchy =>
                hierarchy.filter(obj => obj.id !== objectId)
            );

            // Clear selection if deleted object was selected
            const currentSelection = get(selectedObjects);
            if (currentSelection.some(obj => obj.id === objectId)) {
                selectedObjects.update(objs => objs.filter(obj => obj.id !== objectId));
            }

            this.stats.storeUpdates++;
            return;
        }

        // Handle property updates for existing objects
        // Update selectedObjects store if this object is selected
        const currentSelection = get(selectedObjects);
        const selectedIndex = currentSelection.findIndex(obj => obj.id === objectId);

        if (selectedIndex !== -1) {
            // Merge changes into selected object
            selectedObjects.update(objs => {
                const updated = [...objs];
                updated[selectedIndex] = {
                    ...updated[selectedIndex],
                    ...changes
                };
                return updated;
            });

            this.stats.storeUpdates++;
        }

        // Update object in hierarchy if it exists
        if (changes) {
            objectHierarchy.update(hierarchy => {
                const index = hierarchy.findIndex(obj => obj.id === objectId);
                if (index !== -1) {
                    const updatedHierarchy = [...hierarchy];
                    updatedHierarchy[index] = { ...updatedHierarchy[index], ...changes };
                    return updatedHierarchy;
                }
                return hierarchy;
            });
        }
    }

    /**
     * Handle selection changed messages
     * @private
     */
    private handleSelectionChangedMessage(message: Message): void {
        const { selectedObjectIds, objectData, allObjectData } = message.payload;

        if (selectedObjectIds.length === 0) {
            // Clear selection
            selectedObjects.set([]);
        } else if (allObjectData && allObjectData.length > 0) {
            // Multi-selection or single selection - use allObjectData if available
            selectedObjects.set(allObjectData);
        } else if (objectData) {
            // Fallback: single object data only
            selectedObjects.set([objectData]);
        } else {
            // No object data - just clear
            selectedObjects.set([]);
        }

        this.stats.storeUpdates++;
    }

    /**
     * Handle hierarchy updated messages
     * @private
     */
    private handleHierarchyUpdatedMessage(message: Message): void {
        const { objects } = message.payload;

        // Update hierarchy store (it's just an array of objects)
        objectHierarchy.set(objects || []);

        this.stats.storeUpdates++;
    }

    /**
     * Handle geometry updated messages
     * @private
     */
    private handleGeometryUpdatedMessage(message: Message): void {
        // Similar to state changed, but specifically for geometry
        this.handleStateChangedMessage(message);
    }

    /**
     * Handle tool state changed messages
     * @private
     */
    private handleToolStateChangedMessage(message: Message): void {
        const { activeTool, snapEnabled } = message.payload;

        // Update toolState store
        toolState.set({
            activeTool,
            snapEnabled
        });

        this.stats.storeUpdates++;
    }

    /**
     * Handle request from Main window
     * @private
     */
    async handleRequest(message: Message): Promise<any> {
        this.stats.requestsHandled++;

        const { requestType, data } = message.payload;

        // Route based on request type
        switch (requestType) {
            case 'get-ui-state':
                return this.getUIState();

            case 'get-selected-object':
                return get(selectedObject);

            default:
                throw new Error(`Unknown request type: ${requestType}`);
        }
    }

    /**
     * Get current UI state
     * @private
     */
    private getUIState(): any {
        return {
            selectedObject: get(selectedObject),
            objectHierarchy: get(objectHierarchy)
        };
    }

    /**
     * Send property update to Main (convenience method)
     */
    sendPropertyUpdate(objectId: string, property: string, value: any, source: string = 'input'): boolean {
        const MessageProtocol = (window as any).MessageProtocol;
        if (!MessageProtocol) {
            console.error('❌ MessageProtocol not loaded');
            return false;
        }

        const message = MessageProtocol.MessageBuilders.propertyUpdate(
            objectId,
            property,
            value,
            source
        );

        return this.send(message);
    }

    /**
     * Send tool activation to Main (convenience method)
     */
    sendToolActivate(toolName: string, options: any = {}): boolean {
        const MessageProtocol = (window as any).MessageProtocol;
        if (!MessageProtocol) {
            console.error('❌ MessageProtocol not loaded');
            return false;
        }

        const message = MessageProtocol.MessageBuilders.toolActivate(toolName, options);
        return this.send(message);
    }

    /**
     * Send request and wait for response (convenience method)
     */
    async sendRequest(requestType: string, data: any): Promise<any> {
        if (!this.bridge) {
            throw new Error('Bridge not set');
        }

        const MessageProtocol = (window as any).MessageProtocol;
        if (!MessageProtocol) {
            throw new Error('MessageProtocol not loaded');
        }

        const message = MessageProtocol.MessageBuilders.request(requestType, data);
        return this.bridge.sendRequest(message, 'main');
    }

    /**
     * Get statistics
     */
    getStats(): any {
        return { ...this.stats };
    }

    /**
     * Dispose and cleanup
     */
    dispose(): void {
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
        }

        this.initialized = false;
        console.log('🗑️ UIAdapter disposed');
    }
}

// Create singleton instance
export const uiAdapter = new UIAdapter();

// Also export class for testing
export { UIAdapter };
