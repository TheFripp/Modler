// Modler V2 - Centralized Mesh Synchronization System
// Ensures all related meshes (wireframes, collision, highlights, gizmos) stay synchronized
// Eliminates scattered manual sync calls and prevents synchronization bugs

class MeshSynchronizer {
    constructor() {
        // Registry of main meshes and their related meshes
        // Structure: Map<mainMesh, Array<{relatedMesh, syncType, syncOptions}>>
        this.meshRegistry = new Map();
        
        // Track which meshes have been modified for batch sync
        this.pendingSync = new Set();
        
        // Sync operation counters for debugging
        this.syncStats = {
            totalSyncs: 0,
            batchSyncs: 0,
            skippedSyncs: 0
        };
        
        // Bind methods for use as callbacks
        this.onMeshTransformChanged = this.onMeshTransformChanged.bind(this);
        
    }
    
    /**
     * Register a related mesh that should stay synchronized with a main mesh
     * @param {THREE.Object3D} mainMesh - Primary mesh that others should follow
     * @param {THREE.Object3D} relatedMesh - Related mesh to keep in sync
     * @param {string} syncType - Type of synchronization (position, geometry, visibility, selection, highlight)
     * @param {Object} syncOptions - Optional sync configuration
     */
    registerRelatedMesh(mainMesh, relatedMesh, syncType, syncOptions = {}) {
        if (!mainMesh || !relatedMesh) {
            return false;
        }
        
        // Get or create registry entry for main mesh
        let relatedMeshes = this.meshRegistry.get(mainMesh);
        if (!relatedMeshes) {
            relatedMeshes = [];
            this.meshRegistry.set(mainMesh, relatedMeshes);
        }
        
        // Check if this relationship already exists
        const existing = relatedMeshes.find(entry => 
            entry.relatedMesh === relatedMesh && entry.syncType === syncType
        );
        
        if (existing) {
            existing.syncOptions = { ...existing.syncOptions, ...syncOptions };
            return true;
        }
        
        // Add new relationship
        relatedMeshes.push({
            relatedMesh,
            syncType,
            syncOptions: {
                enabled: true,
                ...syncOptions
            }
        });
        
        // Mark main mesh for change detection
        mainMesh.userData.hasMeshSynchronizer = true;

        return true;
    }
    
    /**
     * Unregister a related mesh
     * @param {THREE.Object3D} mainMesh - Main mesh
     * @param {THREE.Object3D} relatedMesh - Related mesh to unregister
     * @param {string} syncType - Sync type to remove (optional - removes all if not specified)
     */
    unregisterRelatedMesh(mainMesh, relatedMesh, syncType = null) {
        const relatedMeshes = this.meshRegistry.get(mainMesh);
        if (!relatedMeshes) return false;
        
        // Remove matching relationships
        const initialLength = relatedMeshes.length;
        for (let i = relatedMeshes.length - 1; i >= 0; i--) {
            const entry = relatedMeshes[i];
            if (entry.relatedMesh === relatedMesh && 
                (syncType === null || entry.syncType === syncType)) {
                relatedMeshes.splice(i, 1);
            }
        }
        
        // Clean up if no more relationships
        if (relatedMeshes.length === 0) {
            this.meshRegistry.delete(mainMesh);
            delete mainMesh.userData.hasMeshSynchronizer;
        }
        
        const removed = initialLength - relatedMeshes.length;
        
        return removed > 0;
    }
    
    /**
     * Check if sync type requires immediate visual update
     * @param {string} syncType - Sync type to check
     * @returns {boolean} True if sync should be immediate
     */
    isImmediateSync(syncType) {
        const immediateSyncTypes = ['selection', 'highlight', 'visibility'];
        return immediateSyncTypes.includes(syncType);
    }

    /**
     * Synchronize all related meshes for a main mesh with immediate vs deferred prioritization
     * @param {THREE.Object3D} mainMesh - Main mesh that changed
     * @param {string} changeType - Type of change (transform, geometry, visibility)
     * @param {boolean} immediateOnly - If true, only sync immediate visual updates OR process all immediately for drag
     */
    syncAllRelatedMeshes(mainMesh, changeType = 'transform', immediateOnly = false) {
        const relatedMeshes = this.meshRegistry.get(mainMesh);
        if (!relatedMeshes || relatedMeshes.length === 0) {
            return; // No relationships to sync
        }

        let syncCount = 0;
        const deferredSyncs = [];

        relatedMeshes.forEach(({ relatedMesh, syncType, syncOptions }) => {
            if (!syncOptions.enabled) {
                return; // Skip disabled relationships
            }

            // Check if this sync type should respond to this change type
            if (!this.shouldSync(syncType, changeType)) {
                return;
            }

            const isImmediate = this.isImmediateSync(syncType);

            // Real-time mode for drag operations: process everything immediately
            if (immediateOnly && changeType === 'transform') {
                try {
                    const success = this.performSync(mainMesh, relatedMesh, syncType, syncOptions);
                    if (success) {
                        syncCount++;
                    }
                } catch (error) {
                    console.error(`MeshSynchronizer: Error syncing ${syncType} mesh:`, error);
                }
                return; // Process immediately, no deferring
            }

            // Original logic for non-drag operations
            // If immediate only mode, skip non-immediate syncs
            if (immediateOnly && !isImmediate) {
                deferredSyncs.push({ relatedMesh, syncType, syncOptions });
                return;
            }

            // If not immediate only mode but this is deferred, queue for later
            if (!immediateOnly && !isImmediate) {
                deferredSyncs.push({ relatedMesh, syncType, syncOptions });
                return;
            }

            try {
                const success = this.performSync(mainMesh, relatedMesh, syncType, syncOptions);
                if (success) {
                    syncCount++;
                }
            } catch (error) {
                console.error(`MeshSynchronizer: Error syncing ${syncType} mesh:`, error);
            }
        });

        // Schedule deferred syncs for next frame (skip for real-time drag operations)
        if (deferredSyncs.length > 0 && !immediateOnly) {
            requestAnimationFrame(() => {
                deferredSyncs.forEach(({ relatedMesh, syncType, syncOptions }) => {
                    try {
                        this.performSync(mainMesh, relatedMesh, syncType, syncOptions);
                    } catch (error) {
                        console.error(`MeshSynchronizer: Error in deferred sync ${syncType}:`, error);
                    }
                });
            });
        }

        this.syncStats.totalSyncs += syncCount;
    }
    
    /**
     * Batch synchronize multiple main meshes for performance
     * @param {Array<THREE.Object3D>} mainMeshes - Array of main meshes to sync
     * @param {string} changeType - Type of change
     */
    batchSync(mainMeshes, changeType = 'transform') {
        if (!Array.isArray(mainMeshes) || mainMeshes.length === 0) {
            return;
        }
        
        
        mainMeshes.forEach(mainMesh => {
            this.syncAllRelatedMeshes(mainMesh, changeType);
        });
        
        this.syncStats.batchSyncs++;
    }
    
    /**
     * Check if a sync type should respond to a change type
     * @param {string} syncType - Sync type (position, geometry, etc.)
     * @param {string} changeType - Change type (transform, geometry, visibility)
     * @returns {boolean} True if sync should occur
     */
    shouldSync(syncType, changeType) {
        const syncMatrix = {
            'position': ['transform'],
            'geometry': ['transform', 'geometry'],
            'visibility': ['visibility'],
            'selection': ['transform', 'geometry'],
            'highlight': ['transform', 'geometry']
        };
        
        return syncMatrix[syncType]?.includes(changeType) || false;
    }
    
    /**
     * Perform the actual synchronization operation
     * @param {THREE.Object3D} mainMesh - Main mesh
     * @param {THREE.Object3D} relatedMesh - Related mesh to sync
     * @param {string} syncType - Type of sync to perform
     * @param {Object} syncOptions - Sync configuration
     * @returns {boolean} True if sync was successful
     */
    performSync(mainMesh, relatedMesh, syncType, syncOptions) {
        switch (syncType) {
            case 'position':
                return this.syncPosition(mainMesh, relatedMesh, syncOptions);
            
            case 'geometry':
                return this.syncGeometry(mainMesh, relatedMesh, syncOptions);
            
            case 'visibility':
                return this.syncVisibility(mainMesh, relatedMesh, syncOptions);
            
            case 'selection':
                return this.syncSelection(mainMesh, relatedMesh, syncOptions);
            
            case 'highlight':
                return this.syncHighlight(mainMesh, relatedMesh, syncOptions);
            
            default:
                return false;
        }
    }
    
    /**
     * Synchronize position/rotation/scale
     */
    syncPosition(mainMesh, relatedMesh, syncOptions) {
        const { offset = new THREE.Vector3(), relativeToParent = false } = syncOptions;

        if (relativeToParent && relatedMesh.parent) {
            // Position relative to parent (for child meshes like collision boxes)
            relatedMesh.position.copy(offset);
        } else {
            // Absolute world position sync (for wireframes, gizmos)
            relatedMesh.position.copy(mainMesh.position).add(offset);
            relatedMesh.rotation.copy(mainMesh.rotation);
            relatedMesh.scale.copy(mainMesh.scale);
        }

        return true;
    }
    
    /**
     * Synchronize geometry updates
     */
    syncGeometry(mainMesh, relatedMesh, syncOptions) {
        // For geometry changes (like container resizing), related mesh may need new geometry
        if (syncOptions.geometryUpdater && typeof syncOptions.geometryUpdater === 'function') {
            return syncOptions.geometryUpdater(mainMesh, relatedMesh);
        }
        
        // Default: just sync position
        return this.syncPosition(mainMesh, relatedMesh, syncOptions);
    }
    
    /**
     * Synchronize visibility state
     */
    syncVisibility(mainMesh, relatedMesh, syncOptions) {
        relatedMesh.visible = mainMesh.visible;
        return true;
    }
    
    /**
     * Synchronize selection wireframes with special handling for temporary scene children
     */
    syncSelection(mainMesh, relatedMesh, syncOptions) {
        // For geometry changes, use geometryUpdater if available
        if (syncOptions.geometryUpdater && typeof syncOptions.geometryUpdater === 'function') {
            return syncOptions.geometryUpdater(mainMesh, relatedMesh);
        }

        // Handle objects temporarily moved to scene root by ContainerVisibilityManager
        if (mainMesh.userData.temporarySceneChild) {
            // For temporary scene children, wireframe should be in scene root too
            if (relatedMesh.parent && relatedMesh.parent !== mainMesh.parent) {
                // Move wireframe to same parent as object (scene root)
                relatedMesh.parent.remove(relatedMesh);
                if (mainMesh.parent) {
                    mainMesh.parent.add(relatedMesh);
                }
            }
            // Sync position directly since both are in scene coordinates
            relatedMesh.position.copy(mainMesh.position);
            relatedMesh.rotation.copy(mainMesh.rotation);
            relatedMesh.scale.copy(mainMesh.scale);
        } else {
            // Normal case - sync wireframe transform with object transform
            // Ensure wireframe is in same parent as object
            if (relatedMesh.parent !== mainMesh.parent) {
                if (relatedMesh.parent) {
                    relatedMesh.parent.remove(relatedMesh);
                }
                if (mainMesh.parent) {
                    mainMesh.parent.add(relatedMesh);
                }
            }
            relatedMesh.position.copy(mainMesh.position);
            relatedMesh.rotation.copy(mainMesh.rotation);
            relatedMesh.scale.copy(mainMesh.scale);
        }

        return true;
    }
    
    /**
     * Synchronize highlight effects
     */
    syncHighlight(mainMesh, relatedMesh, syncOptions) {
        // ARCHITECTURE COMPLIANCE: Skip child meshes - they use relative positioning
        if (relatedMesh.parent === mainMesh) {
            // Child mesh - position is already relative, no sync needed
            return true;
        }

        // External mesh - sync position and rotation
        relatedMesh.position.copy(mainMesh.position);
        relatedMesh.rotation.copy(mainMesh.rotation);
        relatedMesh.scale.copy(mainMesh.scale);

        // Apply face normal offset if specified (for face highlights)
        if (syncOptions.faceNormalOffset) {
            relatedMesh.position.add(syncOptions.faceNormalOffset);
        }

        return true;
    }
    
    /**
     * Called when a mesh transform changes (automatic detection)
     * @param {THREE.Object3D} mesh - Mesh that changed
     */
    onMeshTransformChanged(mesh) {
        if (mesh.userData.hasMeshSynchronizer) {
            this.syncAllRelatedMeshes(mesh, 'transform');
        }
    }
    
    /**
     * Get debug information about registered relationships
     */
    getDebugInfo() {
        const registryInfo = [];
        
        this.meshRegistry.forEach((relatedMeshes, mainMesh) => {
            registryInfo.push({
                mainMesh: mainMesh.name || 'unnamed',
                relationshipCount: relatedMeshes.length,
                syncTypes: relatedMeshes.map(r => r.syncType)
            });
        });
        
        return {
            totalMainMeshes: this.meshRegistry.size,
            totalRelationships: registryInfo.reduce((sum, info) => sum + info.relationshipCount, 0),
            syncStats: { ...this.syncStats },
            registry: registryInfo
        };
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        this.meshRegistry.clear();
        this.pendingSync.clear();
    }
}

// Export for use in main application
window.MeshSynchronizer = MeshSynchronizer;