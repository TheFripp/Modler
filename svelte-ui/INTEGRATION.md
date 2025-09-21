# Modler V2 - Svelte UI Integration

This directory contains the Svelte + shadcn-svelte UI components that will replace the vanilla JavaScript UI in the main Modler V2 application.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── ui/              # Basic UI primitives (Button, Input, Label)
│   │   └── PropertyPanel.svelte  # Main property panel component
│   ├── stores/
│   │   └── modler.ts        # Svelte stores for state management
│   ├── bridge/
│   │   └── threejs-bridge.ts # Integration bridge with Three.js
│   ├── utils.ts             # Utility functions
│   └── integration.ts       # Integration helper for main app
├── routes/
│   ├── +layout.svelte      # Main layout with CSS imports
│   └── +page.svelte        # Demo page
├── app.css                 # Tailwind CSS with Modler theme
└── app.html                # HTML template
```

## 🎨 Design System

### Color Palette
The Svelte UI uses the exact same colors as the existing Modler V2 application:

```css
--modler-bg: #1a1a1a          /* Main background */
--modler-panel: #252525       /* Panel background */
--modler-border: #404040      /* Border color */
--modler-text: #e0e0e0        /* Primary text */
--modler-text-secondary: #999 /* Secondary text */
--modler-accent: #4a9eff      /* Accent/selection color */
--modler-hover: #333333       /* Hover states */
--modler-input: #2a2a2a       /* Input backgrounds */
```

### Component Library
- **Built on shadcn-svelte principles** for consistency and accessibility
- **Custom Tailwind configuration** matching Modler design language
- **Responsive design** for different screen sizes
- **Dark theme first** with light theme support ready

## 🔗 Integration with Three.js

### State Synchronization
The Svelte UI connects to the existing Three.js application through:

1. **Svelte Stores** (`$lib/stores/modler.ts`)
   - `selectedObjects` - Currently selected objects
   - `objectHierarchy` - All objects in the scene
   - `toolState` - Active tool and settings

2. **ThreeJS Bridge** (`$lib/bridge/threejs-bridge.ts`)
   - Bidirectional communication with `window.modlerComponents`
   - Event listeners for selection changes, tool changes, etc.
   - Property update handlers

### Usage in Main Application

```javascript
// In your main Modler V2 application
import { initializeSvelteUI } from './svelte-ui/src/lib/integration.ts';

// After modlerComponents are initialized
initializeSvelteUI();
```

## 🧩 Components

### PropertyPanel.svelte
Replaces `js/ui/property-panel.js` with modern Svelte implementation:

**Features:**
- ✅ Real-time property editing (position, rotation, dimensions)
- ✅ Material controls (color, opacity) for non-containers
- ✅ Container layout controls (direction, sizing mode)
- ✅ Exact functional parity with vanilla JS version
- ✅ Improved UX with better visual feedback

**Integration Points:**
- Syncs with `window.modlerComponents.selectionController`
- Updates properties via `window.modlerComponents.propertyUpdateHandler`
- Maintains all existing keyboard shortcuts and behaviors

## 🛠️ Development

### Demo Mode
The Svelte UI includes a demo mode for development and testing:

```bash
npm run dev
```

Visit `http://localhost:5173` to see the property panel with sample data.

### Live Integration Testing
To test with the actual Three.js application:

1. Start Svelte dev server: `npm run dev`
2. Open main Modler application in browser
3. Click "Load Svelte UI Demo" button (appears on localhost)
4. Test property panel integration in iframe overlay

### Building for Production
```bash
npm run build
```

Creates optimized bundles in `build/` directory ready for integration.

## 🎯 Migration Progress

### Phase 1: Foundation ✅
- [x] SvelteKit project setup
- [x] Tailwind CSS with Modler color scheme
- [x] Basic UI components (Button, Input, Label)
- [x] State management stores
- [x] ThreeJS bridge architecture

### Phase 2: Core Components ✅
- [x] PropertyPanel component with full functionality
- [x] Real-time property updates
- [x] Container layout controls
- [x] Material editing
- [x] Integration bridge with Three.js

### Phase 3: Advanced Components (Next)
- [ ] ObjectTree component (object hierarchy)
- [ ] Toolbar component (tool selection)
- [ ] Modal dialogs
- [ ] Context menus
- [ ] Settings panel

### Phase 4: Complete Integration (Future)
- [ ] Replace all vanilla JS UI components
- [ ] Performance optimization
- [ ] Responsive design
- [ ] Accessibility compliance
- [ ] Production deployment

## 🧪 Testing

### Manual Testing Checklist
- [ ] Property panel updates object properties in real-time
- [ ] Layout direction buttons activate container layout mode
- [ ] Sizing mode buttons switch between hug/fixed modes
- [ ] Material controls work for non-container objects
- [ ] No performance impact on Three.js rendering
- [ ] Keyboard shortcuts still function correctly

### Integration Testing
- [ ] Bridge successfully connects to `window.modlerComponents`
- [ ] Selection changes sync between Three.js and Svelte
- [ ] Property updates propagate correctly
- [ ] Layout recalculation triggers when expected

## 📖 Technical Notes

### Performance Considerations
- **Debounced Updates**: Property changes are debounced to 16ms (60fps)
- **Selective Reactivity**: Only relevant UI updates on state changes
- **Bundle Optimization**: Manual chunks for modular loading
- **Memory Management**: Proper cleanup of event listeners

### Browser Compatibility
- **Modern browsers**: Chrome 90+, Firefox 88+, Safari 14+
- **ES6+ required**: Uses modern JavaScript features
- **WebGL support**: Inherits Three.js requirements

### Future Enhancements
- **Light theme toggle**: Infrastructure ready, needs UI implementation
- **Animation controls**: Timeline and keyframe interfaces
- **Plugin system**: Extensible component architecture
- **PWA support**: Offline functionality for desktop app feel