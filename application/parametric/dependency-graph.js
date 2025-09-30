/**
 * DependencyGraph - Parametric Dependency Management
 *
 * Manages dependencies between parametric properties and ensures
 * correct update ordering through topological sorting.
 *
 * Features:
 * - Directed acyclic graph (DAG) structure
 * - Circular dependency detection
 * - Topological sort for update ordering
 * - Dependency chain analysis
 * - Change impact analysis
 */

class DependencyGraph {
    constructor() {
        // Graph structure
        this.nodes = new Map(); // nodeId -> { id, type, metadata }
        this.edges = new Map(); // sourceId -> Set<targetId>
        this.reverseEdges = new Map(); // targetId -> Set<sourceId>

        // Statistics
        this.stats = {
            nodes: 0,
            edges: 0,
            cyclesDetected: 0,
            topologicalSorts: 0
        };
    }

    /**
     * Add a node to the graph
     * @param {string} nodeId - Unique node identifier
     * @param {Object} metadata - Additional node information
     */
    addNode(nodeId, metadata = {}) {
        if (!this.nodes.has(nodeId)) {
            this.nodes.set(nodeId, {
                id: nodeId,
                type: metadata.type || 'parameter',
                metadata: metadata
            });
            this.stats.nodes++;
        }
    }

    /**
     * Add a dependency edge from source to target
     * @param {string} sourceId - Source node (the parameter that drives)
     * @param {string} targetId - Target node (the property being driven)
     * @returns {boolean} True if edge added, false if would create cycle
     */
    addDependency(sourceId, targetId) {
        // Ensure both nodes exist
        this.addNode(sourceId);
        this.addNode(targetId);

        // Check if adding this edge would create a cycle
        if (this.wouldCreateCycle(sourceId, targetId)) {
            console.warn('DependencyGraph: Cannot add edge - would create cycle:', sourceId, '->', targetId);
            this.stats.cyclesDetected++;
            return false;
        }

        // Add forward edge
        if (!this.edges.has(sourceId)) {
            this.edges.set(sourceId, new Set());
        }
        this.edges.get(sourceId).add(targetId);

        // Add reverse edge for efficient lookups
        if (!this.reverseEdges.has(targetId)) {
            this.reverseEdges.set(targetId, new Set());
        }
        this.reverseEdges.get(targetId).add(sourceId);

        this.stats.edges++;
        return true;
    }

    /**
     * Remove a dependency edge
     * @param {string} sourceId - Source node
     * @param {string} targetId - Target node
     */
    removeDependency(sourceId, targetId) {
        // Remove forward edge
        if (this.edges.has(sourceId)) {
            this.edges.get(sourceId).delete(targetId);
            if (this.edges.get(sourceId).size === 0) {
                this.edges.delete(sourceId);
            }
            this.stats.edges--;
        }

        // Remove reverse edge
        if (this.reverseEdges.has(targetId)) {
            this.reverseEdges.get(targetId).delete(sourceId);
            if (this.reverseEdges.get(targetId).size === 0) {
                this.reverseEdges.delete(targetId);
            }
        }
    }

    /**
     * Remove a node and all its edges
     * @param {string} nodeId - Node to remove
     */
    removeNode(nodeId) {
        if (!this.nodes.has(nodeId)) return;

        // Remove all outgoing edges
        if (this.edges.has(nodeId)) {
            for (const targetId of this.edges.get(nodeId)) {
                this.removeDependency(nodeId, targetId);
            }
        }

        // Remove all incoming edges
        if (this.reverseEdges.has(nodeId)) {
            for (const sourceId of this.reverseEdges.get(nodeId)) {
                this.removeDependency(sourceId, nodeId);
            }
        }

        // Remove node
        this.nodes.delete(nodeId);
        this.stats.nodes--;
    }

    /**
     * Check if adding an edge would create a cycle
     * @param {string} sourceId - Proposed source
     * @param {string} targetId - Proposed target
     * @returns {boolean} True if cycle would be created
     */
    wouldCreateCycle(sourceId, targetId) {
        // If target can reach source, adding source->target would create cycle
        return this.canReach(targetId, sourceId);
    }

    /**
     * Check if one node can reach another through dependencies
     * @param {string} fromId - Starting node
     * @param {string} toId - Target node
     * @returns {boolean} True if path exists
     */
    canReach(fromId, toId) {
        if (fromId === toId) return true;
        if (!this.edges.has(fromId)) return false;

        const visited = new Set();
        const queue = [fromId];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            if (current === toId) return true;

            const neighbors = this.edges.get(current);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }

        return false;
    }

    /**
     * Get update order for a changed parameter using topological sort
     * @param {string} changedNodeId - Node that changed
     * @returns {Array<string>} Ordered list of nodes to update (excluding the changed node)
     */
    getUpdateOrder(changedNodeId) {
        this.stats.topologicalSorts++;

        // Get all nodes affected by this change (descendants)
        const affectedNodes = this.getDescendants(changedNodeId);

        if (affectedNodes.size === 0) {
            return []; // No dependencies
        }

        // Perform topological sort on affected subgraph
        return this.topologicalSort(affectedNodes);
    }

    /**
     * Get all descendant nodes (nodes that depend on this node, directly or indirectly)
     * @param {string} nodeId - Starting node
     * @returns {Set<string>} Set of descendant node IDs
     */
    getDescendants(nodeId) {
        const descendants = new Set();
        const visited = new Set();
        const queue = [nodeId];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            const neighbors = this.edges.get(current);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    descendants.add(neighbor);
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }

        return descendants;
    }

    /**
     * Perform topological sort on a subset of nodes
     * @param {Set<string>} nodeSet - Set of nodes to sort
     * @returns {Array<string>} Topologically sorted array
     */
    topologicalSort(nodeSet) {
        const sorted = [];
        const visited = new Set();
        const temp = new Set(); // For cycle detection

        const visit = (nodeId) => {
            if (temp.has(nodeId)) {
                // Cycle detected
                console.error('DependencyGraph: Cycle detected during topological sort at node:', nodeId);
                return;
            }
            if (visited.has(nodeId)) {
                return; // Already processed
            }

            temp.add(nodeId);

            // Visit all dependencies first (reverse edges = sources)
            const sources = this.reverseEdges.get(nodeId);
            if (sources) {
                for (const sourceId of sources) {
                    if (nodeSet.has(sourceId)) { // Only visit nodes in our subset
                        visit(sourceId);
                    }
                }
            }

            temp.delete(nodeId);
            visited.add(nodeId);
            sorted.push(nodeId);
        };

        // Visit all nodes in the set
        for (const nodeId of nodeSet) {
            if (!visited.has(nodeId)) {
                visit(nodeId);
            }
        }

        return sorted;
    }

    /**
     * Get all dependencies of a node (what this node depends on)
     * @param {string} nodeId - Node to query
     * @returns {Array<string>} Array of dependency node IDs
     */
    getDependencies(nodeId) {
        const sources = this.reverseEdges.get(nodeId);
        return sources ? Array.from(sources) : [];
    }

    /**
     * Get all dependents of a node (what depends on this node)
     * @param {string} nodeId - Node to query
     * @returns {Array<string>} Array of dependent node IDs
     */
    getDependents(nodeId) {
        const targets = this.edges.get(nodeId);
        return targets ? Array.from(targets) : [];
    }

    /**
     * Get dependency chain depth (longest path from this node)
     * @param {string} nodeId - Starting node
     * @returns {number} Maximum depth
     */
    getDependencyDepth(nodeId) {
        const visited = new Set();

        const getDepth = (id) => {
            if (visited.has(id)) return 0; // Cycle protection
            visited.add(id);

            const targets = this.edges.get(id);
            if (!targets || targets.size === 0) {
                visited.delete(id);
                return 0;
            }

            let maxDepth = 0;
            for (const targetId of targets) {
                const depth = getDepth(targetId);
                maxDepth = Math.max(maxDepth, depth);
            }

            visited.delete(id);
            return maxDepth + 1;
        };

        return getDepth(nodeId);
    }

    /**
     * Analyze impact of changing a parameter
     * @param {string} nodeId - Node that would change
     * @returns {Object} Impact analysis
     */
    analyzeImpact(nodeId) {
        const descendants = this.getDescendants(nodeId);
        const updateOrder = this.topologicalSort(descendants);
        const depth = this.getDependencyDepth(nodeId);

        return {
            affectedCount: descendants.size,
            affectedNodes: Array.from(descendants),
            updateOrder: updateOrder,
            maxDepth: depth,
            directDependents: this.getDependents(nodeId).length
        };
    }

    /**
     * Detect all cycles in the graph
     * @returns {Array<Array<string>>} Array of cycles (each cycle is an array of node IDs)
     */
    detectAllCycles() {
        const cycles = [];
        const visited = new Set();
        const recursionStack = [];

        const detectCycle = (nodeId) => {
            if (recursionStack.includes(nodeId)) {
                // Found cycle - extract it
                const cycleStart = recursionStack.indexOf(nodeId);
                const cycle = recursionStack.slice(cycleStart);
                cycles.push([...cycle, nodeId]); // Close the cycle
                return;
            }

            if (visited.has(nodeId)) return;
            visited.add(nodeId);
            recursionStack.push(nodeId);

            const targets = this.edges.get(nodeId);
            if (targets) {
                for (const targetId of targets) {
                    detectCycle(targetId);
                }
            }

            recursionStack.pop();
        };

        // Check all nodes
        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                detectCycle(nodeId);
            }
        }

        return cycles;
    }

    /**
     * Get graph statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            currentNodes: this.nodes.size,
            currentEdges: this.edges.size,
            avgDependenciesPerNode: this.nodes.size > 0 ?
                (this.edges.size / this.nodes.size).toFixed(2) : 0
        };
    }

    /**
     * Clear the entire graph
     */
    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.reverseEdges.clear();
        this.stats.nodes = 0;
        this.stats.edges = 0;
    }

    /**
     * Dispose of graph resources
     */
    dispose() {
        this.clear();
    }
}

// Export for use in main application
window.DependencyGraph = DependencyGraph;