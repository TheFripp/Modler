/**
 * Yard Builtin Library — Predefined lumber and sheet stock
 *
 * All dimensions stored in METERS (internal standard).
 * Lumber uses actual dimensions (not nominal):
 *   - "2x4" actual = 1.5" x 3.5" = 0.0381m x 0.0889m
 *   - "2x6" actual = 1.5" x 5.5" = 0.0381m x 0.1397m
 *   - etc.
 *
 * Default lengths: 8ft (2.4384m) for lumber, standard sheet sizes for panels.
 */

const YARD_BUILTIN_ITEMS = [
    // ═══════════════════════════════════════════════════
    // DIMENSIONAL LUMBER
    // ═══════════════════════════════════════════════════
    {
        id: 'builtin-1x4',
        name: '1x4',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['trim', 'finish'],
        dimensions: { x: 0.0191, y: 0.0889, z: 2.4384 },   // 0.75" x 3.5" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-1x6',
        name: '1x6',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['trim', 'finish', 'shelving'],
        dimensions: { x: 0.0191, y: 0.1397, z: 2.4384 },   // 0.75" x 5.5" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-2x4',
        name: '2x4',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['framing', 'structural'],
        dimensions: { x: 0.0381, y: 0.0889, z: 2.4384 },   // 1.5" x 3.5" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-2x6',
        name: '2x6',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['framing', 'structural', 'joists'],
        dimensions: { x: 0.0381, y: 0.1397, z: 2.4384 },   // 1.5" x 5.5" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-2x8',
        name: '2x8',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['framing', 'structural', 'joists'],
        dimensions: { x: 0.0381, y: 0.1905, z: 2.4384 },   // 1.5" x 7.25" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-2x10',
        name: '2x10',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['framing', 'structural', 'headers'],
        dimensions: { x: 0.0381, y: 0.2413, z: 2.4384 },   // 1.5" x 9.25" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-2x12',
        name: '2x12',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['framing', 'structural', 'headers', 'beams'],
        dimensions: { x: 0.0381, y: 0.2921, z: 2.4384 },   // 1.5" x 11.25" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#C4A882', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-4x4',
        name: '4x4',
        category: 'Lumber',
        subcategory: 'Dimensional',
        tags: ['post', 'structural'],
        dimensions: { x: 0.0889, y: 0.0889, z: 2.4384 },   // 3.5" x 3.5" x 96"
        fixedDimensions: { x: true, y: true, z: false },
        material: { color: '#B89B72', opacity: 1, transparent: false },
        source: 'builtin'
    },

    // ═══════════════════════════════════════════════════
    // SHEET STOCK — PLYWOOD
    // ═══════════════════════════════════════════════════
    {
        id: 'builtin-plywood-1-4',
        name: '1/4" Plywood',
        category: 'Sheets',
        subcategory: 'Plywood',
        tags: ['panel', 'backing'],
        dimensions: { x: 1.2192, y: 2.4384, z: 0.00635 },  // 48" x 96" x 1/4"
        fixedDimensions: { x: false, y: false, z: true },     // thickness fixed
        material: { color: '#D4B896', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-plywood-1-2',
        name: '1/2" Plywood',
        category: 'Sheets',
        subcategory: 'Plywood',
        tags: ['panel', 'sheathing'],
        dimensions: { x: 1.2192, y: 2.4384, z: 0.0127 },   // 48" x 96" x 1/2"
        fixedDimensions: { x: false, y: false, z: true },
        material: { color: '#D4B896', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-plywood-3-4',
        name: '3/4" Plywood',
        category: 'Sheets',
        subcategory: 'Plywood',
        tags: ['panel', 'sheathing', 'subfloor'],
        dimensions: { x: 1.2192, y: 2.4384, z: 0.01905 },  // 48" x 96" x 3/4"
        fixedDimensions: { x: false, y: false, z: true },
        material: { color: '#D4B896', opacity: 1, transparent: false },
        source: 'builtin'
    },

    // ═══════════════════════════════════════════════════
    // SHEET STOCK — OSB
    // ═══════════════════════════════════════════════════
    {
        id: 'builtin-osb-7-16',
        name: '7/16" OSB',
        category: 'Sheets',
        subcategory: 'OSB',
        tags: ['panel', 'sheathing', 'structural'],
        dimensions: { x: 1.2192, y: 2.4384, z: 0.01111 },  // 48" x 96" x 7/16"
        fixedDimensions: { x: false, y: false, z: true },
        material: { color: '#B8A07A', opacity: 1, transparent: false },
        source: 'builtin'
    },
    {
        id: 'builtin-osb-3-4',
        name: '3/4" OSB',
        category: 'Sheets',
        subcategory: 'OSB',
        tags: ['panel', 'subfloor', 'structural'],
        dimensions: { x: 1.2192, y: 2.4384, z: 0.01905 },  // 48" x 96" x 3/4"
        fixedDimensions: { x: false, y: false, z: true },
        material: { color: '#B8A07A', opacity: 1, transparent: false },
        source: 'builtin'
    }
];

window.YARD_BUILTIN_ITEMS = YARD_BUILTIN_ITEMS;
