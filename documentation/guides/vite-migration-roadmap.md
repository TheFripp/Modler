# Vite Migration Roadmap

**Status**: Planning
**Priority**: High Impact (30-50% startup improvement)
**Estimated Effort**: 2-3 days

## Overview

Migration plan to convert Modler V2 from synchronous script loading to Vite-based ES module bundling for significantly faster startup times and better development experience.

---

## Current State

### Script Loading
- **84 synchronous scripts** loaded via `<script>` tags
- **~1.2MB total JavaScript**
- **No bundling, minification, or tree-shaking**
- Each file parsed individually

### File Structure
```
/Users/fredrikjansson/Documents/Claude/Modler_V2/
├── index.html
├── vendor/
│   ├── three.min.js (589KB)
│   └── split.min.js (6.6KB)
├── core/
│   ├── logger.js
│   └── object-state-manager.js
├── foundation/
│   └── scene-foundation.js
├── scene/ (4 files)
├── interaction/ (11 files)
├── application/ (33 files)
├── layout/ (1 file)
├── integration/ (8 files)
└── v2-main.js
```

### Current Performance
- **Startup**: ~2-3s to full functionality
- **Network**: 84 HTTP requests (even with HTTP/2)
- **Parse Time**: Individual file parsing overhead

---

## Target State

### Bundling Strategy
```
/dist/
├── index.html
├── assets/
│   ├── vendor.js      (~600KB - three.js + deps)
│   ├── core.js        (~150KB - foundation, scene, core)
│   ├── tools.js       (~200KB - tools, utilities)
│   ├── ui.js          (~150KB - integration, svelte bridge)
│   └── parametric.js  (~50KB - lazy loaded)
```

### Expected Performance
- **Startup**: <1s to initial render, <1.5s to full functionality
- **Network**: 4-5 requests (instead of 84)
- **Parse Time**: Optimized bundles with tree-shaking
- **Cache**: Better caching via content-hashed filenames

---

## Migration Steps

### Phase 1: Setup Vite (Day 1)

#### 1.1 Install Dependencies
```bash
npm install --save-dev vite @vitejs/plugin-legacy
```

#### 1.2 Create vite.config.js
```javascript
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    root: '.',
    publicDir: 'vendor',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
            input: {
                main: 'index.html'
            },
            output: {
                manualChunks: {
                    // Vendor chunk (three.js)
                    vendor: ['three'],

                    // Core engine chunk
                    core: [
                        './core/logger',
                        './core/object-state-manager',
                        './foundation/scene-foundation',
                        './scene/scene-controller',
                        './scene/visual-effects'
                    ],

                    // Tools chunk (lazy loaded)
                    tools: [
                        './application/tools/select-tool',
                        './application/tools/move-tool',
                        './application/tools/push-tool',
                        './application/tools/box-creation-tool'
                    ],

                    // UI integration chunk
                    ui: [
                        './integration/svelte/main-integration',
                        './integration/svelte/property-panel-sync',
                        './integration/svelte/panel-manager'
                    ],

                    // Parametric system (deferred)
                    parametric: [
                        './application/parametric/formula-evaluator',
                        './application/parametric/dependency-graph',
                        './application/parametric/constraint-solver'
                    ]
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,  // Remove console.log in production
                drop_debugger: true
            }
        }
    },
    plugins: [
        legacy({
            targets: ['defaults', 'not IE 11']
        })
    ],
    server: {
        port: 3000,
        open: true
    }
});
```

#### 1.3 Update package.json Scripts
```json
{
    "scripts": {
        "dev": "concurrently \"vite\" \"npm run dev:svelte\"",
        "dev:main": "vite",
        "dev:svelte": "cd svelte-ui && npm run dev",
        "build": "vite build && cd svelte-ui && npm run build",
        "preview": "vite preview",
        "build:old": "cd svelte-ui && npm run build"
    }
}
```

### Phase 2: Convert to ES Modules (Day 2)

#### 2.1 Add Module Exports
Convert each file to ES6 module format:

**Before** (core/logger.js):
```javascript
class Logger {
    // ...
}

window.logger = new Logger();
window.Logger = Logger;
```

**After** (core/logger.js):
```javascript
export class Logger {
    // ...
}

export const logger = new Logger();

// Backwards compatibility (temporary)
if (typeof window !== 'undefined') {
    window.logger = logger;
    window.Logger = Logger;
}
```

#### 2.2 Update Imports
**Before** (v2-main.js):
```javascript
// Globals from script tags
const sceneController = new SceneController();
```

**After** (v2-main.js):
```javascript
import { SceneController } from './scene/scene-controller.js';
import { Logger, logger } from './core/logger.js';

const sceneController = new SceneController();
```

#### 2.3 Convert All Files
Priority order:
1. Core (logger, object-state-manager)
2. Foundation (scene-foundation)
3. Scene (scene-controller, visual-effects)
4. Interaction (all files)
5. Application (all files)
6. Integration (all files)

### Phase 3: Update HTML (Day 2)

**Before** (index.html):
```html
<script src="vendor/three.min.js"></script>
<script src="core/logger.js"></script>
<script src="foundation/scene-foundation.js"></script>
<!-- ... 81 more scripts -->
<script src="v2-main.js"></script>
```

**After** (index.html):
```html
<!-- Vite handles all imports via entry point -->
<script type="module" src="/v2-main.js"></script>
```

### Phase 4: Handle THREE.js (Day 2)

#### Option A: Import from npm
```bash
npm install three
```

```javascript
import * as THREE from 'three';
```

#### Option B: Keep vendor file
```javascript
// vite.config.js
export default {
    resolve: {
        alias: {
            'three': '/vendor/three.min.js'
        }
    }
}
```

### Phase 5: Testing and Validation (Day 3)

#### 5.1 Development Testing
```bash
npm run dev
```

Verify:
- ✅ All scripts load correctly
- ✅ No console errors
- ✅ Tools work correctly
- ✅ UI integration works
- ✅ Hot module replacement works

#### 5.2 Production Build Testing
```bash
npm run build
npm run preview
```

Verify:
- ✅ Build completes successfully
- ✅ Bundle sizes reasonable
- ✅ Application functions correctly
- ✅ Performance improved

#### 5.3 Performance Benchmarking
Measure:
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Time to Interactive (TTI)
- Total bundle size

**Target Metrics**:
- TTFB: <100ms
- FCP: <500ms
- TTI: <1.5s
- Total JS: <1MB (gzipped <300KB)

---

## Lazy Loading Strategy

### Dynamic Imports for Tools
```javascript
// application/tool-controller.js
class ToolController {
    async loadTool(toolName) {
        if (this.loadedTools.has(toolName)) {
            return this.loadedTools.get(toolName);
        }

        const toolModule = await import(`./tools/${toolName}-tool.js`);
        const tool = new toolModule.default(this.selectionController, this.visualEffects);
        this.loadedTools.set(toolName, tool);

        return tool;
    }

    async switchToTool(toolName) {
        const tool = await this.loadTool(toolName);
        // ... activation logic
    }
}
```

**Benefits**:
- Only load select-tool initially
- Load other tools on first use
- ~150KB reduction in initial bundle

### Deferred Parametric System
```javascript
// v2-main.js
async function initializeParametric() {
    if (!window.parametricSystemLoaded) {
        const { FormulaEvaluator } = await import('./application/parametric/formula-evaluator.js');
        const { DependencyGraph } = await import('./application/parametric/dependency-graph.js');
        const { ConstraintSolver } = await import('./application/parametric/constraint-solver.js');

        window.parametricSystemLoaded = true;
        logger.info('Parametric system loaded');
    }
}

// Load on first use
window.addEventListener('parametric:needed', initializeParametric);
```

---

## Rollback Plan

### Keep Current System During Migration
```bash
# Create migration branch
git checkout -b vite-migration

# Keep old system accessible
cp index.html index-old.html
```

### Dual System Support
```javascript
// package.json
{
    "scripts": {
        "dev": "vite",
        "dev:old": "node server.js",
        "build": "vite build",
        "build:old": "echo 'No build needed for old system'"
    }
}
```

### Validation Checklist
Before merging vite-migration branch:
- [ ] All features work correctly
- [ ] Performance metrics improved
- [ ] No console errors
- [ ] All tests pass
- [ ] Production build successful

---

## Challenges and Solutions

### Challenge 1: Global Variables
**Problem**: Current code relies heavily on `window.modlerComponents`

**Solution**: Keep global exports during transition
```javascript
// Maintain backwards compatibility
export const modlerComponents = {
    sceneController,
    toolController,
    // ...
};

window.modlerComponents = modlerComponents;
```

### Challenge 2: Script Order Dependencies
**Problem**: Some files expect others to be loaded first

**Solution**: Explicit imports resolve order automatically
```javascript
// scene-controller.js now explicitly imports dependencies
import { GeometryUtils } from '../application/utilities/geometry-utils.js';
import { MaterialManager } from '../application/utilities/material-manager.js';
```

### Challenge 3: THREE.js as Global
**Problem**: Code expects `THREE` to be global

**Solution**: Import and re-export
```javascript
// globals.js
import * as THREE from 'three';
window.THREE = THREE;
export { THREE };
```

---

## Expected Benefits

### Performance
- **30-50% faster startup** (2-3s → <1.5s)
- **Smaller initial bundle** via tree-shaking
- **Better caching** via content hashing
- **Lazy loading** reduces initial load

### Developer Experience
- **Hot Module Replacement** (instant updates)
- **Better error messages** (source maps)
- **Modern tooling** (ES6+ support)
- **Type checking** (future: add TypeScript)

### Production
- **Minification** (smaller bundles)
- **Dead code elimination** (tree-shaking)
- **Automatic vendor splitting**
- **Legacy browser support** via plugin

---

## Implementation Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Setup | 2 hours | Install Vite, create config |
| Module Conversion | 8 hours | Convert 84 files to ES modules |
| HTML Update | 1 hour | Simplify index.html |
| THREE.js Migration | 2 hours | Handle THREE.js import |
| Testing | 4 hours | Validate all features |
| **Total** | **~17 hours** | **~2-3 days** |

---

## Post-Migration Enhancements

### Phase 6: TypeScript Migration
- Add TypeScript support
- Type definitions for better IDE support
- Gradual migration (`.js` → `.ts`)

### Phase 7: Code Splitting Optimization
- Route-based splitting
- Component-level lazy loading
- Prefetching strategies

### Phase 8: Build Optimization
- Compression (gzip/brotli)
- Asset optimization (images, fonts)
- Service worker (offline support)

---

## Related Documentation

- [App Performance Audit](app-performance-audit.md) - Current performance analysis
- [Layout Performance](layout-performance.md) - Layout-specific optimizations

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-30 | Initial Vite migration roadmap |
