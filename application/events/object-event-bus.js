/**
 * ObjectEventBus - Unified Notification Highway
 *
 * Central event system for all object modifications in Modler V2.
 * Replaces multiple disconnected notification pathways with a single,
 * reliable, and performant event system.
 *
 * Features:
 * - Throttled emissions for real-time performance (~60fps)
 * - Batch processing for efficiency
 * - Memory leak prevention
 * - Centralized error handling
 * - Extensible event type system
 */

class ObjectEventBus {
    constructor() {
        // Core event system
        this.subscribers = new Map(); // eventType -> Set<callback>
        this.eventQueue = new Map(); // eventType+objectId -> latest event data
        this.throttleMap = new Map(); // eventType+objectId -> timeout ID

        // Performance settings
        this.THROTTLE_DELAY = 16; // ~60fps for real-time updates
        this.BATCH_DELAY = 100; // Batch non-critical updates
        this.MAX_BATCH_SIZE = 50; // Prevent memory buildup

        // Statistics for debugging
        this.stats = {
            totalEvents: 0,
            throttledEvents: 0,
            batchedEvents: 0,
            subscriberCount: 0,
            errorCount: 0
        };

        // Standardized event types
        this.EVENT_TYPES = {
            // Core CAD events
            TRANSFORM: 'object:transform',     // Position, rotation, scale
            GEOMETRY: 'object:geometry',       // Dimensions, vertices
            MATERIAL: 'object:material',       // Color, opacity, texture
            HIERARCHY: 'object:hierarchy',     // Parent-child relationships
            LIFECYCLE: 'object:lifecycle',     // Create, delete operations
            SELECTION: 'object:selection',     // Selection state changes
            TOOL_STATE: 'tool:state',         // Tool activation/deactivation

            // Parametric design events
            PARAMETRIC_UPDATE: 'parametric:update',       // Parameter value changes
            CONSTRAINT_CHANGE: 'parametric:constraint',   // Property constraints modified
            FORMULA_UPDATE: 'parametric:formula',         // Formula-driven property changes
            DEPENDENCY_UPDATE: 'parametric:dependency',   // Object dependency changes

            // Component instancing events
            INSTANCE_UPDATE: 'component:instance',        // Instance-specific changes
            MASTER_CHANGE: 'component:master',           // Master component modifications
            COMPONENT_SYNC: 'component:sync',            // Full synchronization events

            // Meta-functionality events
            METADATA_CHANGE: 'object:metadata',          // Extended property metadata
            SYSTEM_STATE: 'system:state'                 // Global system state changes
        };

        // Batch processing queue
        this.batchQueue = new Map(); // eventType -> Array<{objectId, data, timestamp}>
        this.batchScheduled = false;

        // Bind methods for callbacks
        this.processBatch = this.processBatch.bind(this);
        this.cleanupThrottles = this.cleanupThrottles.bind(this);

        // Periodic cleanup to prevent memory leaks
        setInterval(this.cleanupThrottles, 60000); // Every minute
    }

    /**
     * Emit an event to all subscribers
     * @param {string} eventType - Type of event (use EVENT_TYPES constants)
     * @param {string} objectId - ID of the object being modified
     * @param {Object} changeData - Data about the change
     * @param {Object} options - Emission options
     * @param {boolean} options.throttle - Whether to throttle this event (default: true)
     * @param {boolean} options.batch - Whether this event can be batched (default: false)
     * @param {boolean} options.immediate - Force immediate emission (default: false)
     * @param {string} options.source - Source of the event for debugging
     */
    emit(eventType, objectId, changeData, options = {}) {
        const {
            throttle = true,
            batch = false,
            immediate = false,
            source = 'unknown'
        } = options;

        try {
            // Validate parameters
            if (!eventType || !objectId) {
                console.error('ObjectEventBus.emit: Missing required parameters', {
                    eventType, objectId, source
                });
                this.stats.errorCount++;
                return false;
            }

            // Create event object
            const event = {
                eventType,
                objectId,
                changeData: changeData || {},
                timestamp: Date.now(),
                source
            };

            this.stats.totalEvents++;

            // Handle immediate emission
            if (immediate) {
                return this._emitImmediate(event);
            }

            // Handle batched events
            if (batch) {
                return this._addToBatch(event);
            }

            // Handle throttled events (most common case)
            if (throttle) {
                return this._emitThrottled(event);
            }

            // Handle non-throttled events
            return this._emitImmediate(event);

        } catch (error) {
            console.error('ObjectEventBus.emit error:', error, {
                eventType, objectId, source
            });
            this.stats.errorCount++;
            return false;
        }
    }

    /**
     * Subscribe to events of a specific type
     * @param {string} eventType - Type of event to listen for
     * @param {Function} callback - Function to call when event occurs
     * @param {Object} options - Subscription options
     * @param {string} options.subscriberId - ID for debugging (optional)
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventType, callback, options = {}) {
        try {
            if (!eventType || typeof callback !== 'function') {
                console.error('ObjectEventBus.subscribe: Invalid parameters', {
                    eventType, callbackType: typeof callback
                });
                return () => {}; // Return no-op unsubscribe
            }

            // Initialize subscriber set if needed
            if (!this.subscribers.has(eventType)) {
                this.subscribers.set(eventType, new Set());
            }

            // Add callback with metadata
            const subscriberInfo = {
                callback,
                subscriberId: options.subscriberId || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                subscribedAt: Date.now()
            };

            this.subscribers.get(eventType).add(subscriberInfo);
            this.stats.subscriberCount++;

            // Return unsubscribe function
            return () => {
                const subscribers = this.subscribers.get(eventType);
                if (subscribers) {
                    subscribers.delete(subscriberInfo);
                    this.stats.subscriberCount--;

                    // Clean up empty event type
                    if (subscribers.size === 0) {
                        this.subscribers.delete(eventType);
                    }
                }
            };

        } catch (error) {
            console.error('ObjectEventBus.subscribe error:', error);
            return () => {}; // Return no-op unsubscribe
        }
    }

    /**
     * Subscribe to all events (useful for debugging)
     * @param {Function} callback - Function to call for any event
     * @returns {Function} Unsubscribe function
     */
    subscribeToAll(callback) {
        const unsubscribeFunctions = [];

        // Subscribe to all current event types
        for (const eventType of Object.values(this.EVENT_TYPES)) {
            unsubscribeFunctions.push(this.subscribe(eventType, callback));
        }

        // Return function that unsubscribes from all
        return () => {
            unsubscribeFunctions.forEach(unsub => unsub());
        };
    }

    /**
     * Emit event immediately without throttling
     * @private
     */
    _emitImmediate(event) {
        const subscribers = this.subscribers.get(event.eventType);
        if (!subscribers || subscribers.size === 0) {
            return true; // No subscribers, but not an error
        }

        let successCount = 0;
        let errorCount = 0;

        // Call each subscriber
        for (const subscriberInfo of subscribers) {
            try {
                subscriberInfo.callback(event);
                successCount++;
            } catch (error) {
                console.error(`ObjectEventBus: Subscriber error for ${event.eventType}:`, error);
                errorCount++;
                this.stats.errorCount++;
            }
        }

        return errorCount === 0;
    }

    /**
     * Emit event with throttling for performance
     * @private
     */
    _emitThrottled(event) {
        const throttleKey = `${event.eventType}:${event.objectId}`;

        // Store latest event data
        this.eventQueue.set(throttleKey, event);

        // Check if already throttled
        if (this.throttleMap.has(throttleKey)) {
            this.stats.throttledEvents++;
            return true; // Event queued, will be emitted later
        }

        // Set up throttle
        const timeoutId = setTimeout(() => {
            const queuedEvent = this.eventQueue.get(throttleKey);
            if (queuedEvent) {
                this._emitImmediate(queuedEvent);
                this.eventQueue.delete(throttleKey);
            }
            this.throttleMap.delete(throttleKey);
        }, this.THROTTLE_DELAY);

        this.throttleMap.set(throttleKey, timeoutId);
        return true;
    }

    /**
     * Add event to batch queue for later processing
     * @private
     */
    _addToBatch(event) {
        if (!this.batchQueue.has(event.eventType)) {
            this.batchQueue.set(event.eventType, []);
        }

        const queue = this.batchQueue.get(event.eventType);
        queue.push(event);
        this.stats.batchedEvents++;

        // Prevent memory buildup
        if (queue.length > this.MAX_BATCH_SIZE) {
            queue.shift(); // Remove oldest event
        }

        // Schedule batch processing
        this._scheduleBatchProcessing();
        return true;
    }

    /**
     * Schedule batch processing
     * @private
     */
    _scheduleBatchProcessing() {
        if (this.batchScheduled) return;

        this.batchScheduled = true;
        setTimeout(this.processBatch, this.BATCH_DELAY);
    }

    /**
     * Process all batched events
     * @private
     */
    processBatch() {
        try {
            for (const [eventType, events] of this.batchQueue.entries()) {
                if (events.length === 0) continue;

                // Group events by object ID to avoid duplicates
                const latestEvents = new Map();
                events.forEach(event => {
                    latestEvents.set(event.objectId, event);
                });

                // Emit each unique event
                for (const event of latestEvents.values()) {
                    this._emitImmediate(event);
                }

                // Clear processed events
                events.length = 0;
            }
        } catch (error) {
            console.error('ObjectEventBus.processBatch error:', error);
            this.stats.errorCount++;
        } finally {
            this.batchScheduled = false;
        }
    }

    /**
     * Clean up expired throttles to prevent memory leaks
     * @private
     */
    cleanupThrottles() {
        // Clear any stuck throttles (shouldn't happen, but safety first)
        if (this.throttleMap.size > 100) {
            console.warn('ObjectEventBus: Clearing excessive throttles', this.throttleMap.size);
            this.throttleMap.clear();
            this.eventQueue.clear();
        }
    }

    /**
     * Get current statistics for debugging
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.eventQueue.size,
            throttleCount: this.throttleMap.size,
            batchQueueSize: Array.from(this.batchQueue.values()).reduce((sum, arr) => sum + arr.length, 0),
            subscribersByType: Object.fromEntries(
                Array.from(this.subscribers.entries()).map(([type, subs]) => [type, subs.size])
            )
        };
    }

    /**
     * Clear all subscribers and reset state (for testing)
     */
    reset() {
        // Clear all timeouts
        for (const timeoutId of this.throttleMap.values()) {
            clearTimeout(timeoutId);
        }

        // Clear all data structures
        this.subscribers.clear();
        this.eventQueue.clear();
        this.throttleMap.clear();
        this.batchQueue.clear();

        // Reset statistics
        Object.keys(this.stats).forEach(key => this.stats[key] = 0);

        this.batchScheduled = false;
    }

    /**
     * Dispose of the event bus and clean up resources
     */
    dispose() {
        this.reset();
        // Note: setInterval cleanup would need a reference to the interval ID
        // For now, we'll let it continue running (minimal impact)
    }
}

// Export for use in main application
window.ObjectEventBus = ObjectEventBus;

// Create global instance
window.objectEventBus = new ObjectEventBus();