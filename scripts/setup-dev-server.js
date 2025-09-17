#!/usr/bin/env node
/**
 * Modler V2 Development Server Setup
 * Sets up a simple development environment for V2 implementation
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class DevServerSetup {
  constructor() {
    this.projectRoot = path.dirname(__dirname);
    this.v1Root = path.resolve(this.projectRoot, '../');
    this.port = 3000;
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  success(message) {
    this.log(`✅ ${message}`, 'green');
  }

  error(message) {
    this.log(`❌ ${message}`, 'red');
  }

  info(message) {
    this.log(`📋 ${message}`, 'blue');
  }

  warning(message) {
    this.log(`⚠️ ${message}`, 'yellow');
  }

  checkV1Environment() {
    this.info('🔍 Checking V1 environment...');
    
    const v1IndexPath = path.join(this.v1Root, 'index.html');
    const v1MainPath = path.join(this.v1Root, 'js/main.js');
    
    if (fs.existsSync(v1IndexPath) && fs.existsSync(v1MainPath)) {
      this.success('V1 codebase found');
      return true;
    } else {
      this.warning('V1 codebase not found in expected location');
      this.info(`Expected V1 at: ${this.v1Root}`);
      return false;
    }
  }

  createV2DevStructure() {
    this.info('🏗️ Setting up V2 development structure...');
    
    const v2DevPath = path.join(this.v1Root, 'v2-dev');
    
    // Create V2 development folder structure
    const folders = [
      'v2-dev',
      'v2-dev/foundation',
      'v2-dev/scene', 
      'v2-dev/interaction',
      'v2-dev/application',
      'v2-dev/application/tools'
    ];

    folders.forEach(folder => {
      const folderPath = path.join(this.v1Root, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        this.success(`Created ${folder}/`);
      } else {
        this.info(`${folder}/ already exists`);
      }
    });

    // Create basic V2 HTML file if it doesn't exist
    const v2IndexPath = path.join(v2DevPath, 'index.html');
    if (!fs.existsSync(v2IndexPath)) {
      this.createV2Index(v2IndexPath);
    }

    return v2DevPath;
  }

  createV2Index(indexPath) {
    const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modler V2 - Development</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: 'Monaco', 'Menlo', monospace;
            background: #1a1a1a;
            color: #fff;
        }
        
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding: 20px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2a2a2a;
        }
        
        .status {
            color: #ffa500;
            font-size: 14px;
            margin-bottom: 10px;
        }
        
        .info {
            color: #888;
            font-size: 12px;
        }
        
        #canvas-container {
            display: flex;
            justify-content: center;
            margin: 20px 0;
        }
        
        canvas {
            border: 1px solid #333;
            border-radius: 4px;
        }
        
        .controls {
            text-align: center;
            margin: 20px;
            padding: 15px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2a2a2a;
        }
        
        .phase-info {
            margin: 20px;
            padding: 15px;
            border: 1px solid #555;
            border-radius: 8px;
            background: #333;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Modler V2 Development</h1>
        <div class="status">Status: Foundation Layer Implementation</div>
        <div class="info">Complexity Budget: &lt;5,000 lines | Target: &lt;1 hour per simple feature</div>
    </div>

    <div id="canvas-container">
        <canvas id="modler-canvas" width="800" height="600"></canvas>
    </div>

    <div class="controls">
        <div><strong>Current Phase:</strong> 1.1 Basic Three.js Setup</div>
        <div style="margin-top: 10px;">
            <button onclick="runPhase1Test()">Test Foundation Layer</button>
            <button onclick="clearCanvas()">Clear Scene</button>
            <button onclick="showMetrics()">Show Metrics</button>
        </div>
    </div>

    <div class="phase-info">
        <h3>📋 Phase 1 Implementation Status</h3>
        <div id="task-status">
            <div>⭕ 1.1 Basic Three.js Setup (Target: ~100 lines)</div>
            <div>⭕ 1.2 Basic Input Handling (Target: ~150 lines)</div>
            <div>⭕ 2.1 Scene Controller (Target: ~200 lines)</div>
            <div>⭕ 2.2 Visual Effects (Target: ~150 lines)</div>
        </div>
    </div>

    <!-- V2 Implementation will be loaded here -->
    <script type="module" src="./foundation/scene-foundation.js"></script>
    <script type="module" src="./foundation/input-foundation.js"></script>
    
    <script>
        // Development helpers
        function runPhase1Test() {
            console.log('🧪 Running Phase 1 tests...');
            // Test basic Three.js setup
            if (typeof SceneFoundation !== 'undefined') {
                console.log('✅ SceneFoundation available');
            } else {
                console.log('❌ SceneFoundation not found');
            }
        }

        function clearCanvas() {
            const canvas = document.getElementById('modler-canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            console.log('🧹 Canvas cleared');
        }

        function showMetrics() {
            console.log('📊 V2 Development Metrics:');
            console.log('- Target Lines: <5,000 total');
            console.log('- Target Files: <20 core files');
            console.log('- Feature Time: <1 hour simple features');
            console.log('- Call Depth: <5 functions per user action');
        }

        // Development logging
        console.log('🚀 Modler V2 Development Environment');
        console.log('📚 Check IMPLEMENTATION_PLAN_V2.md for current tasks');
        console.log('🏗️ Build in /v2-dev/ folder structure');
        console.log('⚙️ Use console commands: runPhase1Test(), showMetrics()');
    </script>
</body>
</html>`;

    fs.writeFileSync(indexPath, indexContent);
    this.success('Created v2-dev/index.html');
  }

  findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      
      server.listen(startPort, (err) => {
        if (err) {
          server.close();
          this.findAvailablePort(startPort + 1).then(resolve).catch(reject);
        } else {
          const port = server.address().port;
          server.close();
          resolve(port);
        }
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.findAvailablePort(startPort + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async startSimpleServer(v2DevPath) {
    this.info('🌐 Starting development server...');

    const port = await this.findAvailablePort(this.port);
    const server = http.createServer((req, res) => {
      let filePath = path.join(this.v1Root, req.url === '/' ? '/v2-dev/index.html' : req.url);
      
      // Handle v2-dev paths
      if (req.url.startsWith('/v2-dev/')) {
        filePath = path.join(this.v1Root, req.url);
      }
      
      // Fallback to V1 files for reference
      if (!fs.existsSync(filePath)) {
        filePath = path.join(this.v1Root, req.url);
      }

      // Serve file or 404
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript', 
          '.css': 'text/css',
          '.json': 'application/json'
        };
        
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
    });

    server.listen(port, () => {
      this.success(`Development server running on http://localhost:${port}`);
      this.info('📁 Serving files from V1 root with V2 development overlay');
      this.info('🎯 V2 Development: http://localhost:' + port + '/v2-dev/');
      this.info('📚 V1 Reference: http://localhost:' + port + '/');
      
      // Try to open browser
      this.tryOpenBrowser(`http://localhost:${port}/v2-dev/`);
    });

    return server;
  }

  tryOpenBrowser(url) {
    const start = process.platform === 'darwin' ? 'open' : 
                  process.platform === 'win32' ? 'start' : 'xdg-open';
    
    spawn(start, [url], { detached: true, stdio: 'ignore' }).unref();
    this.info(`🌐 Attempting to open ${url}`);
  }

  displayInstructions() {
    this.log('\n' + '='.repeat(60), 'bold');
    this.log('🚀 DEVELOPMENT SERVER READY', 'bold');  
    this.log('='.repeat(60), 'bold');

    this.log('\n📁 File Structure:', 'cyan');
    this.log('   /v2-dev/               ← V2 implementation files');
    this.log('   /v2-dev/foundation/    ← Phase 1: Three.js setup');
    this.log('   /v2-dev/scene/         ← Phase 2: Scene management');
    this.log('   /v2-dev/interaction/   ← Phase 3: Input handling');
    this.log('   /v2-dev/application/   ← Phase 4: Tools and UI');

    this.log('\n🎯 Development Workflow:', 'cyan');
    this.log('   1. Read IMPLEMENTATION_PLAN_V2.md for current tasks');
    this.log('   2. Implement in /v2-dev/ following V2 architecture');
    this.log('   3. Test in browser at /v2-dev/ endpoint');
    this.log('   4. Reference V1 code at root endpoint if needed');

    this.log('\n📊 Complexity Budgets:', 'cyan');
    this.log('   - Foundation Layer: ~250 lines total');
    this.log('   - Scene Layer: ~350 lines total');
    this.log('   - Interaction Layer: ~350 lines total');
    this.log('   - Application Layer: ~250 lines total');

    this.log('\n⚙️ Development Commands:', 'cyan');
    this.log('   - Health check: node scripts/health-check.js');
    this.log('   - File watching: Use your editor\'s auto-refresh');
    this.log('   - Browser testing: Use Playwright MCP tools');

    this.log('\n⏹️ To stop server: Ctrl+C', 'yellow');
  }

  async run() {
    this.log('🚀 Setting up Modler V2 development environment...\n', 'bold');

    // Check V1 environment
    const v1Available = this.checkV1Environment();
    
    if (!v1Available) {
      this.warning('Continuing without V1 reference');
    }

    // Create V2 development structure
    const v2DevPath = this.createV2DevStructure();

    // Start development server
    try {
      await this.startSimpleServer(v2DevPath);
      this.displayInstructions();
      
      // Keep server running
      process.on('SIGINT', () => {
        this.log('\n👋 Shutting down development server...', 'yellow');
        process.exit(0);
      });

      this.log('\n⏳ Server running... (Press Ctrl+C to stop)', 'green');
      
    } catch (error) {
      this.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new DevServerSetup();
  setup.run().catch(console.error);
}

module.exports = DevServerSetup;