# Schema Update Guide

## Overview

This guide explains how to add new properties to the ObjectData schema safely and correctly. Following these steps ensures the property will be included in all serialization, deserialization, and UI rendering.

## The Problem We Solved

Previously, adding a new property required updating 6+ places manually:
1. TypeScript interface
2. JavaScript schema
3. `serializeForPostMessage()`
4. `convertFromFlatProperties()`
5. `convertFromThreeJS()`
6. `convertFromObjectStateManager()`

**This was error-prone** - the `autoLayout` bug happened because it was added to the schema but forgotten in `serializeForPostMessage()`.

## New Approach: Schema-Driven

Now we use **schema-driven serialization**. Add a property once to the schema, and all serialization is updated automatically.

---

## How to Add a New Property

### Step 1: Update the Schema

**File**: `/application/serialization/object-data-format.js`

Add your property to `STANDARD_OBJECT_DATA_SCHEMA`:

```javascript
const STANDARD_OBJECT_DATA_SCHEMA = {
    // ... existing properties ...

    // Your new property:
    myNewProperty: 'string',  // or 'number', 'boolean', { nested: 'object' }, etc.

    // ... rest of schema ...
};
```

#### Type Syntax

- **Primitives**: `'string'`, `'number'`, `'boolean'`
- **Arrays**: `'array'`
- **Objects**: `'object'` or `{ key: 'type' }` for nested structure
- **Optional**: `'string|null'`, `'number|undefined'`
- **Nested**: Define full structure
  ```javascript
  myComplex: {
      nested: 'string',
      values: 'array',
      count: 'number'
  }
  ```

### Step 2: Update TypeScript Interface

**File**: `/svelte-ui/src/lib/types/object-data.ts`

Add the same property to the `ObjectData` interface:

```typescript
export interface ObjectData {
    // ... existing properties ...

    // Your new property (must match schema name):
    myNewProperty: string;  // TypeScript type

    // ... rest of interface ...
}
```

**IMPORTANT**: Property name MUST match schema exactly.

### Step 3: That's It!

✅ **Serialization automatically updated** - `serializeForPostMessage()` uses schema
✅ **Type checking works** - TypeScript interface ensures type safety
✅ **Tests will validate** - Unit tests check all schema properties are present
✅ **No manual enumeration** - Schema-driven approach handles everything

---

## Example: Adding `snapToGrid` Property

### 1. Add to Schema

```javascript
const STANDARD_OBJECT_DATA_SCHEMA = {
    // ... existing ...

    // New property
    snapToGrid: 'boolean',

    // ... rest ...
};
```

### 2. Add to TypeScript

```typescript
export interface ObjectData {
    // ... existing ...

    snapToGrid: boolean;

    // ... rest ...
}
```

### 3. Use in Code

```javascript
// In Three.js object:
mesh.userData.snapToGrid = true;

// In ObjectStateManager:
objectStateManager.updateObject(objectId, { snapToGrid: true });

// In Svelte UI:
$displayObject.snapToGrid  // ✅ Automatically available!
```

---

## Validation

### Run Tests

```bash
node tests/serialization/object-data-format.test.js
```

Tests will:
- ✅ Verify all schema properties are in serialized output
- ✅ Check TypeScript types match (if validation script exists)
- ✅ Ensure new references created for Svelte reactivity

### Manual Verification

1. Add property to schema & TypeScript
2. Set property value in `mesh.userData`
3. Click object in UI
4. Check property appears in `$displayObject`

If it's missing, the schema-driven serializer will include it automatically (unlike the old manual approach).

---

## Advanced: Nested Properties

### Adding Complex Nested Structure

```javascript
// Schema:
const STANDARD_OBJECT_DATA_SCHEMA = {
    // ...

    animations: {
        enabled: 'boolean',
        clips: 'array',
        currentClip: 'string|null',
        speed: 'number'
    }
};

// TypeScript:
export interface Animations {
    enabled: boolean;
    clips: string[];
    currentClip: string | null;
    speed: number;
}

export interface ObjectData {
    // ...
    animations: Animations;
}
```

### Default Values

Schema-driven serializer provides defaults:
- `'string'` → `''`
- `'number'` → `0`
- `'boolean'` → `false`
- `'array'` → `[]`
- `'object'` or `{ ... }` → `{}`
- `'type|null'` → `null`
- `'type|undefined'` → `undefined`

To customize defaults, set them when creating objects:

```javascript
mesh.userData.animations = {
    enabled: false,
    clips: [],
    currentClip: null,
    speed: 1.0  // Custom default
};
```

---

## Migration Guide

### Converting Old Manual Functions

If you have legacy converter functions still using manual enumeration:

**Before** (manual):
```javascript
function myConverter(data) {
    return {
        id: data.id,
        name: data.name,
        // ... 30 manual properties
    };
}
```

**After** (schema-driven):
```javascript
function myConverter(data) {
    return window.SchemaSerializer.serializeWithSchema(
        data,
        STANDARD_OBJECT_DATA_SCHEMA
    );
}
```

Benefits:
- No more forgetting properties
- Automatic new reference creation
- Type validation
- Single source of truth

---

## Troubleshooting

### Property Not Appearing in UI

**Check**:
1. ✅ Added to `STANDARD_OBJECT_DATA_SCHEMA`?
2. ✅ Added to TypeScript `ObjectData` interface?
3. ✅ Property name matches exactly (case-sensitive)?
4. ✅ Schema-serializer loaded before object-data-format? (check index.html)

### Type Mismatch Errors

TypeScript and JavaScript schema must match:
- JS: `myProp: 'number'` → TS: `myProp: number`
- JS: `myProp: 'string|null'` → TS: `myProp: string | null`
- JS: `myProp: { x: 'number' }` → TS: `myProp: { x: number }`

### Svelte Reactivity Not Working

Ensure schema-serializer creates new references:
```javascript
// ✅ Good - uses schema-serializer (creates new refs)
const serialized = window.SchemaSerializer.serializeWithSchema(data, schema);

// ❌ Bad - returns same reference (no reactivity)
const serialized = data;
```

---

## Best Practices

1. **Always use schema-driven serialization** - Don't manually enumerate properties
2. **Keep schema and TypeScript in sync** - Same property names and types
3. **Test after adding properties** - Run unit tests to verify
4. **Document complex properties** - Add comments for nested structures
5. **Use TypeScript autocomplete** - Interface ensures correct property access

---

## Files Reference

### Core Files
- `/application/serialization/object-data-format.js` - **Schema definition**
- `/application/serialization/schema-serializer.js` - Schema-driven engine
- `/svelte-ui/src/lib/types/object-data.ts` - **TypeScript interface**

### Tests
- `/tests/serialization/object-data-format.test.js` - Validation tests

### Integration
- `/index.html` - Script loading order (schema-serializer before object-data-format)

---

## Summary

**Old way** (manual):
Add property → Update 6 files → Easy to forget → Bugs like missing `autoLayout`

**New way** (schema-driven):
Add to schema → Add to TypeScript → Done! All serialization auto-updated

This prevents entire classes of bugs and makes the codebase maintainable.
