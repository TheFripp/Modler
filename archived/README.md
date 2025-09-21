# Archived Files

This directory contains files that have been removed from the active codebase but preserved for reference.

## Archived Components (`/components/`)

### **layout-tool.js**
- **Reason**: LayoutTool was replaced by property-driven layout system (PropertyUpdateHandler)
- **Status**: Tool removed from v2-main.js registration but file was still being loaded in HTML
- **Replacement**: Property panel changes now trigger layout via PropertyUpdateHandler

### **container-visibility-manager.js**
- **Reason**: Replaced by UnifiedContainerManager
- **Status**: Disabled in v2-main.js (commented out) but still loaded in HTML
- **Replacement**: UnifiedContainerManager handles all container visibility

### **container-support-manager.js**
- **Reason**: Replaced by UnifiedContainerManager
- **Status**: Disabled in v2-main.js (commented out) but still loaded in HTML
- **Replacement**: UnifiedContainerManager handles container support structures

### **modler-ui.js**
- **Reason**: UI moved to inline implementation in index.html
- **Status**: File existed but was never loaded or used
- **Replacement**: Inline UI components in index.html

## Archived Documentation (`/documentation/`)

### **Future Architecture Docs** (Not Yet Implemented)
- `formula-engine.md` - Parametric expression evaluation system
- `component-template-manager.md` - Template/instance relationship system
- `layout-propagation-engine.md` - Advanced layout dependency system
- `dependency-graph-system.md` - Object relationship tracking system

### **Redundant Documentation**
- `property-update-handler.md` - Content covered in container-architecture-master.md
- `snap-system.md` - Partial documentation, may be consolidated later
- `camera-raycasting.md` - Partial documentation, may be consolidated later

## Archived Backups (`/backups/`)

### **index-broken-backup.html**
- **Reason**: Old broken version kept as backup
- **Status**: Never used in current system

## Recovery

If any of these files need to be restored:

1. **Components**: Copy back to original location and add script inclusion to index.html
2. **Documentation**: Copy back to `/documentation/systems/`
3. **Backups**: Reference only, not intended for restoration

## File Count Reduction

- **Before**: 72 total files
- **After**: 50 active files
- **Archived**: 22 files (30% reduction)

*Last updated: Current session*