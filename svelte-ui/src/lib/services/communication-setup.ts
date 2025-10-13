/**
 * Communication Setup - Initialize CommunicationBridge and UIAdapter
 *
 * Sets up the UI side of the Phase 3 communication architecture:
 * - Creates UIAdapter instance
 * - Connects to Main window's CommunicationBridge
 * - Initializes message listening
 *
 * Call once per panel during onMount()
 */

import { UIAdapter } from './ui-adapter';

let uiAdapter: UIAdapter | null = null;
let bridge: any = null;

/**
 * Initialize the UI communication system
 * Should be called once per panel in onMount()
 */
export function initializeCommunication(): boolean {
    // Only initialize once per window
    if (uiAdapter) {
        console.log('ℹ️ Communication already initialized');
        return true;
    }

    try {
        // Wait for MessageProtocol to be loaded
        const MessageProtocol = (window as any).MessageProtocol;
        if (!MessageProtocol) {
            console.error('❌ MessageProtocol not loaded - cannot initialize communication');
            return false;
        }

        // Create UIAdapter
        uiAdapter = new UIAdapter();

        // Create CommunicationBridge (UI side)
        const CommunicationBridge = (window as any).CommunicationBridge;
        if (!CommunicationBridge) {
            console.error('❌ CommunicationBridge not loaded');
            return false;
        }

        bridge = new CommunicationBridge();

        // Initialize bridge with UIAdapter (null for mainAdapter on UI side)
        bridge.initialize(null, uiAdapter);

        // Initialize UIAdapter
        if (!uiAdapter.initialize()) {
            console.error('❌ UIAdapter initialization failed');
            return false;
        }

        // Store globally for debugging
        (window as any).uiAdapter = uiAdapter;
        (window as any).communicationBridge = bridge;

        console.log('✅ UI Communication initialized');
        return true;

    } catch (error) {
        console.error('❌ Communication initialization error:', error);
        return false;
    }
}

/**
 * Get the UIAdapter instance
 */
export function getUIAdapter(): UIAdapter | null {
    return uiAdapter;
}

/**
 * Get the CommunicationBridge instance
 */
export function getBridge(): any {
    return bridge;
}
