/**
 * StorageInterface - Storage Backend Contract
 *
 * Defines the interface that all storage backends must implement.
 * IndexedDBWrapper already conforms to this shape.
 * Future backends (REST API, cloud storage) must implement the same methods.
 *
 * All methods are async and return Promises.
 *
 * @interface StorageInterface
 *
 * @method initialize() → Promise<void>
 *   Prepare the storage backend for use (open DB, authenticate, etc.)
 *
 * @method get(id: string) → Promise<Object|null>
 *   Retrieve a stored item by ID. Returns null if not found.
 *
 * @method set(id: string, data: Object) → Promise<string>
 *   Store an item. Returns the ID. Overwrites if ID already exists.
 *
 * @method getAll(options?: { sortBy?: string, order?: 'asc'|'desc' }) → Promise<Array<Object>>
 *   Retrieve all stored items, optionally sorted.
 *
 * @method delete(id: string) → Promise<boolean>
 *   Remove an item by ID. Returns true if deleted.
 *
 * @method exists(id: string) → Promise<boolean>
 *   Check if an item exists by ID.
 *
 * @method count() → Promise<number>
 *   Return total number of stored items.
 */

// This file is documentation only — no runtime code.
// IndexedDBWrapper is the default implementation.
// To add a new backend, implement a class with the methods above
// and pass it to FileManager via: new FileManager({ storage: yourBackend })
