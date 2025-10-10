/**
 * IndexedDBWrapper - Low-Level IndexedDB Storage
 *
 * Provides simple async CRUD interface for file storage.
 * Used by FileManager for local file persistence.
 *
 * Database: ModlerV2_Files
 * Store: scenes (fileId -> scene data)
 */

class IndexedDBWrapper {
    constructor() {
        this.dbName = 'ModlerV2_Files';
        this.storeName = 'scenes';
        this.version = 1;
        this.db = null;

        // Statistics
        this.stats = {
            reads: 0,
            writes: 0,
            deletes: 0,
            errors: 0
        };
    }

    /**
     * Initialize database connection
     * Creates database and object store if they don't exist
     * @returns {Promise<IDBDatabase>} Database instance
     */
    async initialize() {
        if (this.db) {
            return this.db; // Already initialized
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to open database: ${request.error}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });

                    // Create indexes for efficient querying
                    objectStore.createIndex('name', 'metadata.name', { unique: false });
                    objectStore.createIndex('modified', 'metadata.modified', { unique: false });
                    objectStore.createIndex('created', 'metadata.created', { unique: false });
                }
            };
        });
    }

    /**
     * Store a file in the database
     * @param {string} id - File ID (unique identifier)
     * @param {Object} data - File data (scene JSON)
     * @returns {Promise<string>} File ID
     */
    async set(id, data) {
        await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);

            // Add ID to data object
            const fileData = {
                id: id,
                ...data
            };

            const request = objectStore.put(fileData);

            request.onsuccess = () => {
                this.stats.writes++;
                resolve(id);
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to save file: ${request.error}`));
            };
        });
    }

    /**
     * Retrieve a file from the database
     * @param {string} id - File ID
     * @returns {Promise<Object|null>} File data or null if not found
     */
    async get(id) {
        await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(id);

            request.onsuccess = () => {
                this.stats.reads++;
                resolve(request.result || null);
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to retrieve file: ${request.error}`));
            };
        });
    }

    /**
     * Get all files from the database
     * @param {Object} options - Query options
     * @param {string} options.sortBy - Index to sort by ('name', 'modified', 'created')
     * @param {string} options.order - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of file data objects
     */
    async getAll(options = {}) {
        await this.initialize();

        const sortBy = options.sortBy || 'modified';
        const order = options.order || 'desc';

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);

            let request;
            if (sortBy && objectStore.indexNames.contains(sortBy)) {
                const index = objectStore.index(sortBy);
                const direction = order === 'desc' ? 'prev' : 'next';
                request = index.openCursor(null, direction);
            } else {
                request = objectStore.openCursor();
            }

            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    this.stats.reads++;
                    resolve(results);
                }
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to retrieve files: ${request.error}`));
            };
        });
    }

    /**
     * Delete a file from the database
     * @param {string} id - File ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        await this.initialize();

        console.log(`IndexedDBWrapper: Deleting file with ID: ${id}`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(id);

            request.onsuccess = () => {
                this.stats.deletes++;
                console.log(`IndexedDBWrapper: Successfully deleted file ${id}`);
                resolve(true);
            };

            request.onerror = () => {
                this.stats.errors++;
                console.error(`IndexedDBWrapper: Failed to delete file ${id}:`, request.error);
                reject(new Error(`Failed to delete file: ${request.error}`));
            };
        });
    }

    /**
     * Check if a file exists
     * @param {string} id - File ID
     * @returns {Promise<boolean>} True if file exists
     */
    async exists(id) {
        await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.count(id);

            request.onsuccess = () => {
                resolve(request.result > 0);
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to check file existence: ${request.error}`));
            };
        });
    }

    /**
     * Clear all files from the database (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to clear database: ${request.error}`));
            };
        });
    }

    /**
     * Get total file count
     * @returns {Promise<number>} Number of files
     */
    async count() {
        await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.count();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                this.stats.errors++;
                reject(new Error(`Failed to count files: ${request.error}`));
            };
        });
    }

    /**
     * Get storage statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            reads: 0,
            writes: 0,
            deletes: 0,
            errors: 0
        };
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.IndexedDBWrapper = IndexedDBWrapper;
}
