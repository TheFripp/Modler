#!/usr/bin/env node

/**
 * Modler V2 - Server Health Check
 * Verifies both servers are running and properly configured
 */

const http = require('http');

const MAIN_PORT = 3000;
const SVELTE_PORT = 5173;
const TIMEOUT = 5000; // 5 second timeout

async function checkServer(host, port, name) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: host,
            port: port,
            path: '/',
            timeout: TIMEOUT
        }, (res) => {
            resolve({
                name: name,
                status: 'online',
                port: port,
                statusCode: res.statusCode,
                url: `http://${host}:${port}`
            });
        });

        req.on('error', (err) => {
            resolve({
                name: name,
                status: 'offline',
                port: port,
                error: err.message,
                url: `http://${host}:${port}`
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                name: name,
                status: 'timeout',
                port: port,
                error: 'Connection timeout',
                url: `http://${host}:${port}`
            });
        });
    });
}

async function main() {
    console.log('🔍 Modler V2 Development Server Health Check');
    console.log('='.repeat(50));

    // Check both servers in parallel
    const [mainServer, svelteServer] = await Promise.all([
        checkServer('localhost', MAIN_PORT, 'Main Application Server'),
        checkServer('localhost', SVELTE_PORT, 'Svelte UI Server')
    ]);

    // Display results
    const servers = [mainServer, svelteServer];
    let allHealthy = true;

    for (const server of servers) {
        const status = server.status === 'online' ? '✅' : '❌';
        console.log(`${status} ${server.name}`);
        console.log(`   URL: ${server.url}`);

        if (server.status === 'online') {
            console.log(`   Status: HTTP ${server.statusCode}`);
        } else {
            console.log(`   Status: ${server.status}`);
            if (server.error) {
                console.log(`   Error: ${server.error}`);
            }
            allHealthy = false;
        }
        console.log('');
    }

    // Overall health status
    console.log('='.repeat(50));
    if (allHealthy) {
        console.log('✅ All servers are healthy!');
        console.log('\n🚀 Ready for development:');
        console.log(`   • Main App: http://localhost:${MAIN_PORT}`);
        console.log(`   • Svelte UI: http://localhost:${SVELTE_PORT}`);
        console.log('\n💡 The main app automatically connects to the Svelte UI server');
        process.exit(0);
    } else {
        console.log('❌ Some servers are not responding');
        console.log('\n🛠️  Troubleshooting:');

        if (mainServer.status !== 'online') {
            console.log('   • Start main server: npm run dev:main');
        }

        if (svelteServer.status !== 'online') {
            console.log('   • Start Svelte server: npm run dev:svelte');
        }

        console.log('   • Or start both: npm run dev');
        console.log('\n📖 See README.md for detailed setup instructions');
        process.exit(1);
    }
}

main().catch(console.error);