# Modler V2 🚀

**CAD software with rule-based parametric design and intelligent 3D auto-layout system**

Modern 3D modeling application with container-based hierarchies, automatic object distribution, gap management, and constraint-based positioning.

## Quick Start ⚡

### Prerequisites
- **Node.js** 16+
- **npm** or **yarn**

### 1. Setup & Install
```bash
# Install main project dependencies
npm install

# Install Svelte UI dependencies
cd svelte-ui && npm install && cd ..

# Or use the setup script
npm run setup
```

### 2. Start Development Servers
```bash
# Start both servers (recommended)
npm run dev

# Or start individually:
npm run dev:main    # Main app server (port 3000)
npm run dev:svelte  # Svelte UI server (port 5173)
```

### 3. Open Application
- 🌐 **Main Application**: [http://localhost:3000](http://localhost:3000)
- 🎨 **Svelte UI Server**: [http://localhost:5173](http://localhost:5173) (for debugging)

The main application automatically connects to the Svelte UI server for enhanced panels.

### 4. Verify Setup
```bash
# Check server health
npm run health-check

# Or manually check servers
node scripts/server-health.js
```

## Development Architecture 🏗️

### Server Architecture
- **Main Application Server** (port 3000): Serves core app, 3D engine, tools
- **Svelte UI Server** (port 5173): Modern reactive UI panels and components
- **Cross-Origin Integration**: Automatic iframe-based communication

### Core Systems
- **Scene Controller**: 3D object management with Three.js
- **Selection System**: Container-first selection with unified visualization
- **Tool System**: Move, Push, Select tools with face-based interaction
- **Container System**: Nested containers with auto-layout and gap management
- **UI Integration**: Real-time sync between 3D scene and Svelte UI panels

## Development Workflow 📝

### Starting Development
```bash
npm run dev              # Start both servers
# ✅ Main server: http://localhost:3000
# ✅ Svelte server: http://localhost:5173
# ✅ Auto-detection and iframe integration
```

### Common Commands
```bash
npm run build           # Build Svelte UI for production
npm run preview         # Preview production build
npm run clean           # Clean all build artifacts and dependencies
node scripts/server-health.js  # Check server status
```

### Hot Reload Support
- ✅ **Main App**: Automatic browser refresh on file changes
- ✅ **Svelte UI**: Vite HMR (Hot Module Replacement)
- ✅ **Cross-Communication**: Real-time data sync between servers

## Troubleshooting 🔧

### Common Issues

#### "Broken UI panels" / "Need to reload"
**Cause**: Svelte server connection issues or port conflicts
```bash
# Check server status
npm run health-check

# Restart servers
npm run dev

# Clear cached port detection
# In browser console: localStorage.removeItem('svelte-dev-port')
```

#### "CORS errors" / "Can't load iframe"
**Cause**: Missing CORS headers or file:// protocol usage
```bash
# Ensure using http://localhost:3000 (not file://)
# Main server provides proper CORS headers
```

#### Port conflicts
```bash
# Change main server port
PORT=3001 npm run dev:main

# Change Svelte server port
cd svelte-ui && PORT=5174 npm run dev
```

#### "Module not found" errors
```bash
# Reinstall dependencies
npm run clean
npm run setup
```

### Development Server Status
```bash
✅ Main server healthy: http://localhost:3000
✅ Svelte server healthy: http://localhost:5173
✅ Integration: Automatic iframe connection
✅ CORS: Enabled for cross-origin requests
✅ Hot reload: Both servers supporting live updates
```

## Project Structure 📁

```
modler-v2/
├── server.js                 # Main application server
├── package.json              # Main project dependencies & scripts
├── index.html                # Main application entry point
├── svelte-integration-v2.js  # UI integration layer
│
├── svelte-ui/                # Modern UI components
│   ├── package.json          # Svelte dependencies
│   ├── vite.config.ts        # Vite configuration
│   └── src/                  # Svelte components & stores
│
├── scripts/                  # Development utilities
│   ├── server-health.js      # Server status checker
│   └── health-check.js       # Project health validator
│
├── foundation/               # Core 3D engine
├── scene/                    # Scene management
├── interaction/              # Selection & visualization
├── application/              # Tools & managers
├── layout/                   # Auto-layout engine
└── styles/                   # CSS stylesheets
```

## Features ✨

### 3D Modeling Core
- **Three.js Engine**: Hardware-accelerated 3D rendering
- **Face-Based Tools**: Direct mesh face manipulation
- **Real-Time Sync**: Selection boxes follow geometry changes
- **Snap System**: Precision alignment and positioning

### Container System
- **Nested Containers**: Unlimited hierarchy depth
- **Auto-Layout**: X/Y/Z axis automatic object distribution
- **Gap Management**: Consistent spacing between objects
- **Visual Feedback**: Container wireframes and context dimming

### Selection & Interaction
- **Container-First Selection**: Click child → selects container
- **Double-Click Step-In**: Navigate into container contexts
- **Multi-Selection**: Select multiple objects with Shift/Ctrl
- **Visual Hierarchy**: Objects dim when in container context

### Modern UI
- **Reactive Panels**: Real-time property updates
- **Drag & Drop**: Object hierarchy management
- **Resizable Panels**: Flexible workspace layout
- **Dark Theme**: Optimized for long development sessions

## Performance 🚄

### Optimizations
- **Parallel Server Startup**: Both servers start simultaneously
- **Cached Port Detection**: Instant UI loading on subsequent starts
- **Throttled Updates**: 120fps property panel updates during drag operations
- **Mesh Synchronization**: Efficient selection box updates

### Development Tips
- Use `npm run dev` for best experience (both servers)
- Main app automatically detects Svelte server ports (5173-5177)
- Clear browser cache if panels behave unexpectedly
- Check console for integration status messages

## Contributing 🤝

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Run development setup: `npm run setup && npm run dev`
4. Make your changes and test with `npm run health-check`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style
- **ES6+ JavaScript** for main application
- **TypeScript + Svelte** for UI components
- **Functional approach** preferred over classes where possible
- **Clear naming** - prefer explicit over clever

## License 📄

MIT License - see [LICENSE](LICENSE) file for details.

---

**Need Help?**
- 🐛 Report issues on GitHub
- 💬 Check server status: `npm run health-check`
- 🔧 Restart servers: `npm run dev`