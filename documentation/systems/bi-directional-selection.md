# Bi-Directional Selection System

## Overview

The bi-directional selection system provides seamless interaction between the 3D scene and object list UI, enabling users to select objects in either interface with automatic synchronization.

## Key Features

- **Scene → UI**: Objects selected in 3D scene automatically highlight in object list
- **UI → Scene**: Objects clicked in object list automatically select in 3D scene
- **Smart Navigation**: Integrates with NavigationController for container context switching
- **Real-time Sync**: Immediate visual feedback in both directions
- **Container Aware**: Handles nested container hierarchies automatically

## Architecture

### Core Components

1. **ThreeJS Bridge** (`svelte-ui/src/lib/bridge/threejs-bridge.ts`)
   - Manages communication between Svelte UI and Three.js scene
   - Handles iframe detection and PostMessage routing

2. **Main Integration** (`integration/svelte/main-integration.js`)
   - Receives and processes selection messages from UI
   - Manages port detection and security validation

3. **Object List Panel** (`svelte-ui/src/routes/left-panel/+page.svelte`)
   - Displays object hierarchy with click handlers
   - Sends selection messages to main application

### Communication Flow

#### UI → Scene Selection
```
1. User clicks object in list
2. selectObjectInScene() called with objectId
3. PostMessage sent to parent window
4. Main integration validates origin
5. handleObjectSelection() processes request
6. NavigationController.navigateToObject() called
7. Object selected in 3D scene
8. Selection state synced back to UI
```

#### Scene → UI Selection
```
1. User selects object in 3D scene
2. SelectionController triggers callback
3. Bridge syncs selection to Svelte stores
4. Object list highlights selected item
5. Property panel updates with object data
```

## Implementation Details

### Port Detection Security

**Problem Solved**: PostMessage origin validation failed due to missing `detectedPort` property.

**Solution**: Added port storage in `SveltePortDetector._setUrls()`:
```javascript
_setUrls(port) {
    this.detectedPort = port;  // Added this line
    this.baseUrl = `http://localhost:${port}`;
    // ...
}
```

### Object Filtering

Utility objects (grids, interactive helpers) are filtered from the object list:
```javascript
const filteredObjects = allObjects.filter(obj =>
    obj.name !== 'Floor Grid' &&
    obj.type !== 'grid' &&
    !obj.name?.toLowerCase().includes('grid') &&
    obj.name !== '(Interactive)' &&
    !obj.name?.toLowerCase().includes('interactive')
);
```

### Message Structure

Selection messages use consistent structure:
```typescript
{
    type: 'object-select',
    data: {
        objectId: string,
        parentContainer: string | null,
        useNavigationController: boolean
    }
}
```

## Navigation Integration

### NavigationController Priority

The system prioritizes NavigationController for unified navigation:
1. **Primary**: `NavigationController.navigateToObject(objectId)`
2. **Fallback**: Direct selection methods
3. **Container Handling**: Automatic parent container navigation

### Container Context

When selecting objects in containers:
1. Check current container context
2. Navigate to parent container if needed
3. Select child object within container
4. Update container context in UI

## Error Handling

### PostMessage Validation
- Origin verification against detected Svelte port
- Type safety for message structure
- Graceful fallbacks for missing components

### Object Resolution
- ID validation before selection attempts
- Mesh availability checks
- Clear error logging for debugging

## Performance Considerations

### Throttled Updates
- Real-time property updates are throttled (16ms)
- Prevents excessive UI updates during interactions
- Maintains 60fps performance target

### Efficient Filtering
- Object filtering applied at serialization level
- Reduced data transfer between iframe and parent
- Cached filter results where possible

## File Structure

```
integration/svelte/
├── main-integration.js          # Main message handling and selection logic
├── data-sync.js                 # Object data serialization and filtering
├── port-detection.js            # Svelte server detection and security
└── panel-manager.js             # UI panel lifecycle management

svelte-ui/src/
├── lib/bridge/threejs-bridge.ts # Iframe communication bridge
├── lib/stores/modler.ts         # Reactive data stores
└── routes/left-panel/+page.svelte # Object list with click handlers
```

## Debugging

### Debug Mode
Enable detailed logging by adding console.log statements to:
- `selectObjectInScene()` - UI click handling
- `handleObjectSelection()` - Main integration processing
- `NavigationController.navigateToObject()` - Navigation logic

### Common Issues
1. **Port Mismatch**: Check `detectedPort` is set correctly
2. **Origin Rejection**: Verify Svelte server port matches detected port
3. **Object Not Found**: Ensure object ID exists in SceneController
4. **Navigation Failure**: Check NavigationController availability

## Testing

### Manual Testing
1. Create objects in 3D scene (press B for box)
2. Verify objects appear in left panel object list
3. Click objects in list → should select in 3D scene
4. Select objects in 3D scene → should highlight in list
5. Test with containers and nested hierarchies

### Integration Points
- NavigationController availability
- SceneController object management
- SelectionController state synchronization
- PostMessage security validation