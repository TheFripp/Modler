#!/usr/bin/env node

/**
 * Modler V2 - Development Server
 * Simple HTTP server with CORS support for local development
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// MIME type mapping for proper content serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

function servePage(req, res, filePath) {
    const fullPath = path.join(__dirname, filePath);

    // Security check - prevent directory traversal
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    fs.readFile(normalizedPath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end('<h1>404 Not Found</h1><p>File not found: ' + filePath + '</p>');
            } else {
                res.writeHead(500, {
                    'Content-Type': 'text/plain',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end('500 Internal Server Error\n' + err.message);
            }
        } else {
            const mimeType = getMimeType(filePath);
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Cache-Control': 'no-cache, no-store, must-revalidate', // Prevent caching during development
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content);
        }
    });
}

const server = http.createServer((req, res) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Default to index.html for root requests
    if (pathname === '/') {
        pathname = '/index.html';
    }

    // Remove leading slash for path resolution
    const filePath = pathname.substring(1) || 'index.html';

    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

    servePage(req, res, filePath);
});

server.listen(PORT, HOST, () => {
    console.log('\n🚀 Modler V2 Development Server');
    console.log('─'.repeat(40));
    console.log(`📍 Server: http://${HOST}:${PORT}`);
    console.log(`📂 Serving: ${__dirname}`);
    console.log(`🔧 Environment: development`);
    console.log(`✅ CORS: enabled for all origins`);
    console.log(`🔄 Cache: disabled for development`);
    console.log('\n💡 Tip: Start Svelte UI server with "npm run dev" in /svelte-ui/ directory');
    console.log('─'.repeat(40));
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development server...');
    server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });
});

// Error handling
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please choose a different port.`);
        console.error(`   Try: PORT=3001 node server.js`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});