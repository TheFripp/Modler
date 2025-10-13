/**
 * Communication Bridge - Unified Bidirectional Message System
 *
 * Replaces:
 * - PropertyPanelSync (1258 LOC) - Main → UI
 * - UnifiedCommunication (295 LOC) - UI → Main
 * - PropertyController partial logic (539 LOC) - UI state
 *
 * Target: ~400 LOC with cleaner architecture
 *
 * Version: 1.0.0
 * Part of: Phase 3 - Communication Layer Consolidation
 */

class CommunicationBridge {
    constructor() {
        // Adapters (injected)
        this.mainAdapter = null;
        this.uiAdapter = null;

        // Message queues by strategy
        this.immediateQueue = [];
        this.throttledQueue = new Map(); // messageType+objectId → message
        this.batchedQueue = new Map();   // messageType → [messages]

        // Throttling state
        this.throttleTimers = new Map();
        this.batchTimer = null;
        this.THROTTLE_DELAY = 16; // 60fps
        this.BATCH_DELAY = 100;

        // Request/Response tracking
        this.pendingRequests = new Map(); // requestId → {resolve, reject, timeout}
        this.REQUEST_TIMEOUT = 5000;

        // Statistics
        this.stats = {
            sent: 0,
            received: 0,
            throttled: 0,
            batched: 0,
            errors: 0,
            requestsHandled: 0
        };

        // Circular update prevention
        this.recentMessages = new Map(); // messageKey → timestamp
        this.CIRCULAR_WINDOW = 100; // ms to detect circular updates

        // State
        this.initialized = false;
        this.paused = false;
    }

    /**
     * Initialize with adapters
     */
    initialize(mainAdapter, uiAdapter) {
        this.mainAdapter = mainAdapter;
        this.uiAdapter = uiAdapter;

        // Wire up adapters to bridge
        if (this.mainAdapter) {
            this.mainAdapter.setBridge(this);
        }
        if (this.uiAdapter) {
            this.uiAdapter.setBridge(this);
        }

        this.initialized = true;
        console.log('✅ CommunicationBridge initialized');
    }

    /**
     * Send message to UI
     * @param {Message} message - Message to send
     */
    sendToUI(message) {
        if (!this.initialized || this.paused) {
            console.warn('CommunicationBridge: Cannot send - not initialized or paused');
            return false;
        }

        // Circular update detection
        if (this.isCircularUpdate(message)) {
            console.warn('🔄 Circular update detected, suppressing:', message.type, message.payload.objectId);
            return false;
        }

        // Route based on emission strategy
        switch (message.strategy) {
            case window.MessageProtocol.EMISSION_STRATEGY.IMMEDIATE:
                return this.sendImmediate(message, 'ui');

            case window.MessageProtocol.EMISSION_STRATEGY.THROTTLED:
                return this.sendThrottled(message, 'ui');

            case window.MessageProtocol.EMISSION_STRATEGY.BATCHED:
                return this.sendBatched(message, 'ui');

            default:
                return this.sendImmediate(message, 'ui');
        }
    }

    /**
     * Send message to Main
     * @param {Message} message - Message to send
     */
    sendToMain(message) {
        if (!this.initialized || this.paused) {
            console.warn('CommunicationBridge: Cannot send - not initialized or paused');
            return false;
        }

        // Circular update detection
        if (this.isCircularUpdate(message)) {
            console.warn('🔄 Circular update detected, suppressing:', message.type, message.payload.objectId);
            return false;
        }

        // Route based on emission strategy
        switch (message.strategy) {
            case window.MessageProtocol.EMISSION_STRATEGY.IMMEDIATE:
                return this.sendImmediate(message, 'main');

            case window.MessageProtocol.EMISSION_STRATEGY.THROTTLED:
                return this.sendThrottled(message, 'main');

            case window.MessageProtocol.EMISSION_STRATEGY.BATCHED:
                return this.sendBatched(message, 'main');

            default:
                return this.sendImmediate(message, 'main');
        }
    }

    /**
     * Send message immediately
     * @private
     */
    sendImmediate(message, direction) {
        try {
            // Validate message
            const validation = window.MessageProtocol.MessageValidator.validate(message);
            if (!validation.isValid) {
                console.error('❌ Invalid message:', validation.errors);
                this.stats.errors++;
                return false;
            }

            // Track for circular detection
            this.trackMessage(message);

            // Send through appropriate adapter
            if (direction === 'ui') {
                // Main → UI: Use postMessage (UI adapter is in iframe)
                if (this.uiAdapter) {
                    this.uiAdapter.send(message);
                } else {
                    // Fallback: Direct postMessage when no UIAdapter (Main side)
                    this.sendDirectToUI(message);
                }
            } else if (direction === 'main') {
                // UI → Main: Use adapter
                if (this.mainAdapter) {
                    this.mainAdapter.send(message);
                } else {
                    console.error('❌ No adapter for direction: main');
                    return false;
                }
            } else {
                console.error('❌ Unknown direction:', direction);
                return false;
            }

            this.stats.sent++;
            return true;

        } catch (error) {
            console.error('❌ CommunicationBridge send error:', error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Send message with throttling (60fps max)
     * @private
     */
    sendThrottled(message, direction) {
        const throttleKey = `${message.type}:${message.payload?.objectId || 'global'}`;

        // Store latest message
        this.throttledQueue.set(throttleKey, { message, direction });

        // Check if already throttled
        if (this.throttleTimers.has(throttleKey)) {
            this.stats.throttled++;
            return true; // Queued, will be sent later
        }

        // Set up throttle
        const timer = setTimeout(() => {
            const queued = this.throttledQueue.get(throttleKey);
            if (queued) {
                this.sendImmediate(queued.message, queued.direction);
                this.throttledQueue.delete(throttleKey);
            }
            this.throttleTimers.delete(throttleKey);
        }, this.THROTTLE_DELAY);

        this.throttleTimers.set(throttleKey, timer);
        return true;
    }

    /**
     * Send message with batching
     * @private
     */
    sendBatched(message, direction) {
        const batchKey = message.type;

        if (!this.batchedQueue.has(batchKey)) {
            this.batchedQueue.set(batchKey, []);
        }

        this.batchedQueue.get(batchKey).push({ message, direction });
        this.stats.batched++;

        // Schedule batch processing
        this.scheduleBatchProcessing();
        return true;
    }

    /**
     * Schedule batch processing
     * @private
     */
    scheduleBatchProcessing() {
        if (this.batchTimer) {
            return; // Already scheduled
        }

        this.batchTimer = setTimeout(() => {
            this.processBatchedMessages();
            this.batchTimer = null;
        }, this.BATCH_DELAY);
    }

    /**
     * Process all batched messages
     * @private
     */
    processBatchedMessages() {
        for (const [batchKey, messages] of this.batchedQueue) {
            // Group by objectId to avoid duplicate updates
            const latestByObjectId = new Map();

            messages.forEach(({ message, direction }) => {
                const objectId = message.payload?.objectId || 'global';
                latestByObjectId.set(objectId, { message, direction });
            });

            // Send latest for each objectId
            for (const { message, direction } of latestByObjectId.values()) {
                this.sendImmediate(message, direction);
            }
        }

        this.batchedQueue.clear();
    }

    /**
     * Detect circular updates
     * @private
     */
    isCircularUpdate(message) {
        const messageKey = `${message.type}:${message.payload?.objectId || 'global'}:${JSON.stringify(message.payload)}`;
        const now = Date.now();

        // Check if same message sent recently
        if (this.recentMessages.has(messageKey)) {
            const lastTime = this.recentMessages.get(messageKey);
            if (now - lastTime < this.CIRCULAR_WINDOW) {
                return true; // Circular update detected
            }
        }

        return false;
    }

    /**
     * Track message for circular detection
     * @private
     */
    trackMessage(message) {
        const messageKey = `${message.type}:${message.payload?.objectId || 'global'}:${JSON.stringify(message.payload)}`;
        this.recentMessages.set(messageKey, Date.now());

        // Clean up old messages
        if (this.recentMessages.size > 100) {
            const now = Date.now();
            for (const [key, timestamp] of this.recentMessages) {
                if (now - timestamp > this.CIRCULAR_WINDOW) {
                    this.recentMessages.delete(key);
                }
            }
        }
    }

    /**
     * Send request and wait for response
     * @param {Message} message - Request message
     * @returns {Promise} Resolves with response data
     */
    async sendRequest(message, direction) {
        return new Promise((resolve, reject) => {
            // Set requiresResponse
            message.requiresResponse = true;

            // Store pending request
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(message.id);
                reject(new Error(`Request timeout: ${message.type}`));
            }, this.REQUEST_TIMEOUT);

            this.pendingRequests.set(message.id, { resolve, reject, timeout });

            // Send request
            const sent = direction === 'ui'
                ? this.sendToUI(message)
                : this.sendToMain(message);

            if (!sent) {
                clearTimeout(timeout);
                this.pendingRequests.delete(message.id);
                reject(new Error('Failed to send request'));
            }
        });
    }

    /**
     * Handle response to a pending request
     * @param {Message} responseMessage - Response message
     */
    handleResponse(responseMessage) {
        const requestId = responseMessage.requestId;
        const pending = this.pendingRequests.get(requestId);

        if (!pending) {
            console.warn('Received response for unknown request:', requestId);
            return;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);

        if (responseMessage.payload.success) {
            pending.resolve(responseMessage.payload.data);
        } else {
            pending.reject(new Error(responseMessage.payload.error || 'Request failed'));
        }

        this.stats.requestsHandled++;
    }

    /**
     * Send message directly to UI iframes via postMessage
     * Used when UIAdapter is not available (Main side sending to UI)
     * @private
     */
    sendDirectToUI(message) {
        try {
            const serialized = message.serialize();

            // Send to all iframes (property panel, left panel, toolbar)
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage(serialized, '*');
                }
            });

            return true;
        } catch (error) {
            console.error('❌ sendDirectToUI error:', error);
            return false;
        }
    }

    /**
     * Receive message from adapter
     * Called by MainAdapter or UIAdapter when message arrives
     */
    receiveMessage(message, sourceAdapter) {
        this.stats.received++;

        // Handle responses
        if (message.type === window.MessageProtocol.MESSAGE_TYPES.RESPONSE) {
            this.handleResponse(message);
            return;
        }

        // Handle requests (messages requiring response)
        if (message.requiresResponse) {
            this.handleRequest(message, sourceAdapter);
            return;
        }

        // Regular message - route to opposite adapter
        if (sourceAdapter === this.mainAdapter && this.uiAdapter) {
            this.uiAdapter.receive(message);
        } else if (sourceAdapter === this.uiAdapter && this.mainAdapter) {
            this.mainAdapter.receive(message);
        }
    }

    /**
     * Handle request message
     * @private
     */
    async handleRequest(message, sourceAdapter) {
        try {
            // Process request through appropriate adapter
            let responseData;
            if (sourceAdapter === this.uiAdapter && this.mainAdapter) {
                responseData = await this.mainAdapter.handleRequest(message);
            } else if (sourceAdapter === this.mainAdapter && this.uiAdapter) {
                responseData = await this.uiAdapter.handleRequest(message);
            }

            // Send response
            const response = window.MessageProtocol.MessageBuilders.response(
                message.id,
                responseData,
                true
            );
            sourceAdapter.send(response);

        } catch (error) {
            // Send error response
            const errorResponse = window.MessageProtocol.MessageBuilders.response(
                message.id,
                { error: error.message },
                false
            );
            sourceAdapter.send(errorResponse);
        }
    }

    /**
     * Pause message sending (for debugging/testing)
     */
    pause() {
        this.paused = true;
        console.log('⏸️ CommunicationBridge paused');
    }

    /**
     * Resume message sending
     */
    resume() {
        this.paused = false;
        console.log('▶️ CommunicationBridge resumed');
    }

    /**
     * Flush all pending messages immediately
     */
    flush() {
        // Flush throttled messages
        for (const [key, { message, direction }] of this.throttledQueue) {
            this.sendImmediate(message, direction);
        }
        this.throttledQueue.clear();
        this.throttleTimers.forEach(timer => clearTimeout(timer));
        this.throttleTimers.clear();

        // Flush batched messages
        this.processBatchedMessages();

        console.log('🚀 CommunicationBridge flushed');
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            pendingRequests: this.pendingRequests.size,
            throttledQueue: this.throttledQueue.size,
            batchedQueue: Array.from(this.batchedQueue.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            sent: 0,
            received: 0,
            throttled: 0,
            batched: 0,
            errors: 0,
            requestsHandled: 0
        };
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this.flush();
        this.throttleTimers.forEach(timer => clearTimeout(timer));
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.pendingRequests.clear();
        this.recentMessages.clear();
        this.initialized = false;
        console.log('🗑️ CommunicationBridge disposed');
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.CommunicationBridge = CommunicationBridge;
}

// Export for Node/module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommunicationBridge;
}
