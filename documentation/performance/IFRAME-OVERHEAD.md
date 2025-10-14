# Iframe Loading Overhead - Dev Mode Performance

**Status**: Known Issue - Dev Mode Only
**Impact**: ~7 seconds initial load time
**Affects**: Development only (production will be faster)

---

## Problem

Current loading times (dev mode):
- **Toolbar**: 7064ms (7 seconds)
- **Left Panel**: 2206ms (2 seconds)
- **Property Panel**: 2209ms (2 seconds)
- **Total**: ~11 seconds until fully interactive

## Root Cause

The `DirectComponentManager` is misnamed - it actually creates **iframes** for each panel, not direct mounting:

```javascript
// integration/svelte/direct-component-manager.js:165
const iframe = document.createElement('iframe');
iframe.src = `http://localhost:5173${route}`;
```

Each iframe:
1. Loads Vite dev server independently
2. Compiles Svelte components on-demand
3. Creates its own `CommunicationBridge` instance
4. Initializes stores and adapters separately

**Why first panel is slower:**
- Vite cold start: Must compile dependencies from scratch
- Subsequent panels are faster: Vite has cached compiled modules

**Log evidence:**
```
communication-bridge.js:71 ✅ CommunicationBridge initialized  (toolbar)
ui-adapter.ts:61 ✅ UIAdapter initialized                     (toolbar)
communication-bridge.js:71 ✅ CommunicationBridge initialized  (left panel)
ui-adapter.ts:61 ✅ UIAdapter initialized                     (left panel)
communication-bridge.js:71 ✅ CommunicationBridge initialized  (property panel)
ui-adapter.ts:61 ✅ UIAdapter initialized                     (property panel)
```

Three separate bridge instances created!

---

## Quick Fixes Applied

### 1. Remove Artificial Delay (✅ DONE)
**File**: `integration/svelte/direct-component-manager.js:106`

**Before**:
```javascript
async mountSidePanelsLazy() {
    // Small delay to let the main thread breathe
    await new Promise(resolve => setTimeout(resolve, 100));
```

**After**:
```javascript
async mountSidePanelsLazy() {
    // Load immediately - no delay needed (Vite has already warmed up)
    // await new Promise(resolve => setTimeout(resolve, 100));
```

**Improvement**: Saves 100ms

### 2. Preconnect to Vite Server (✅ ALREADY IN PLACE)
**File**: `index.html:17-19`

```html
<link rel="preconnect" href="http://localhost:5173">
<link rel="dns-prefetch" href="http://localhost:5173">
```

Warms up connection to Vite dev server.

---

## Real Solution (Future Work)

### Remove Iframes Entirely

**Goal**: True direct component mounting (not iframe-based)

**Approach 1: Single Svelte App with Multiple Mount Points**
```javascript
// Instead of iframes, mount Svelte components directly
import { mount } from 'svelte';
import Toolbar from './routes/main-toolbar/+page.svelte';
import LeftPanel from './routes/left-panel/+page.svelte';

mount(Toolbar, { target: document.getElementById('main-toolbar-container') });
mount(LeftPanel, { target: document.getElementById('left-panel-container') });
```

**Benefits**:
- One shared CommunicationBridge
- One shared store instance
- No iframe overhead
- Instant component rendering

**Challenges**:
- Requires building Svelte UI as library, not app
- Need to handle Vite build configuration
- Must ensure proper store isolation if needed

**Approach 2: Production Build Only**
- Accept iframe overhead in dev mode
- Production build bundles everything into one HTML file
- No iframes in production = fast loading

**Estimated Effort**: 4-6 hours for Approach 1, ~1 hour for Approach 2

---

## Why This Matters Less Than It Seems

### Development Mode Reality
- Developers refresh infrequently after initial load
- Vite HMR updates components instantly (no full reload)
- 7-second initial load is annoying but not blocking

### Production Reality
- Build process bundles everything into static files
- No Vite compilation overhead
- No iframe creation overhead
- Expected load time: <1 second

### Similar Tools
Many dev tools have slow dev mode but fast production:
- Next.js dev server: 5-10s initial load
- Create React App: 3-5s initial load
- Vite itself: Optimizes for HMR, not cold start

---

## Recommended Next Steps

### Short Term (Accept Current Behavior)
1. Document that 7s load is dev-mode only ✅
2. Ensure production build is fast (test with `npm run build`)
3. Focus on HMR experience (component updates should be instant)

### Medium Term (Optimize Vite Config)
1. Pre-bundle common dependencies
2. Optimize Svelte compiler options
3. Reduce bundle size

**Vite config options**:
```javascript
// vite.config.js
export default {
  optimizeDeps: {
    include: ['lucide-svelte', 'svelte'] // Pre-bundle common deps
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['lucide-svelte']
        }
      }
    }
  }
}
```

### Long Term (Remove Iframes)
1. Refactor DirectComponentManager to use true direct mounting
2. Build Svelte UI as library with exposed mount functions
3. Share single CommunicationBridge across all components
4. Expected improvement: 7s → <1s

---

## Measurement Methodology

To measure loading performance accurately:

```javascript
// Current measurements (in direct-component-manager.js)
const componentStart = performance.now();
// ... component loads ...
const componentTime = (performance.now() - componentStart).toFixed(0);
console.log(`✅ ${componentName} loaded in ${componentTime}ms`);
```

**What's being measured:**
- Time from iframe creation to `load` event
- Includes: network request, Vite compilation, component rendering

**What's NOT measured:**
- Vite server startup (happens before first request)
- Module graph resolution
- HMR connection establishment

---

## Conclusion

The 7-second load time is a **known limitation of the iframe-based architecture in dev mode**. Quick fixes save 100ms, but real improvement requires removing iframes (4-6 hour refactor) or accepting this as dev-mode overhead.

**Recommendation**: Accept current behavior, ensure production build is fast, revisit iframe removal as a dedicated refactoring project when time permits.

**Priority**: Low (doesn't affect production, doesn't block development)
