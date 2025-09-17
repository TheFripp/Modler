#!/usr/bin/env node

/**
 * V2 Complexity Guard - Automatic Violation Detection
 * Run this before every commit or development session
 */

const fs = require('fs');
const path = require('path');

// V2 Complexity Limits
const LIMITS = {
    MAX_FILE_LINES: 300,
    MAX_TOTAL_FILES: 20,
    MAX_TOTAL_LINES: 5000,
    MAX_FUNCTION_DEPTH: 5, // Not implemented yet, needs AST parsing
};

// File patterns to check
const CODE_PATTERNS = {
    js: /\.js$/,
    html: /\.html$/,
    css: /\.css$/
};

// Anti-patterns that indicate complexity creep
const ANTI_PATTERNS = [
    { pattern: /class \w*Manager/, message: "Manager classes detected - use controllers instead" },
    { pattern: /class \w*System/, message: "System classes detected - use direct implementation" },
    { pattern: /new EventEmitter|\.on\(|\.emit\(/, message: "Event systems detected - use direct calls" },
    { pattern: /dependency.*inject|inject.*dependency/i, message: "Dependency injection detected - use simple constructors" },
    { pattern: /abstract class|interface/i, message: "Abstractions detected - implement directly first" },
    { pattern: /factory|builder|strategy|observer/i, message: "Design patterns detected - avoid premature abstraction" }
];

function countLines(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').length;
    } catch (err) {
        return 0;
    }
}

function checkAntiPatterns(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const violations = [];
        
        ANTI_PATTERNS.forEach(({ pattern, message }) => {
            if (pattern.test(content)) {
                violations.push(message);
            }
        });
        
        return violations;
    } catch (err) {
        return [];
    }
}

function scanDirectory(dir, results = { files: [], totalLines: 0 }) {
    if (!fs.existsSync(dir)) return results;
    
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            // Skip node_modules, .git, scripts (utility files), etc.
            if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'scripts') {
                scanDirectory(fullPath, results);
            }
        } else if (stat.isFile()) {
            // Check if it's a code file
            const isCodeFile = Object.values(CODE_PATTERNS).some(pattern => pattern.test(entry));
            if (isCodeFile) {
                const lines = countLines(fullPath);
                const antiPatterns = checkAntiPatterns(fullPath);
                
                results.files.push({
                    path: fullPath,
                    lines: lines,
                    antiPatterns: antiPatterns
                });
                results.totalLines += lines;
            }
        }
    }
    
    return results;
}

function runComplexityCheck() {
    console.log('🔍 Running V2 Complexity Check...\n');
    
    const results = scanDirectory('.');
    let violations = [];
    
    // Check total metrics
    if (results.files.length > LIMITS.MAX_TOTAL_FILES) {
        violations.push(`❌ Too many files: ${results.files.length}/${LIMITS.MAX_TOTAL_FILES}`);
    }
    
    if (results.totalLines > LIMITS.MAX_TOTAL_LINES) {
        violations.push(`❌ Too many total lines: ${results.totalLines}/${LIMITS.MAX_TOTAL_LINES}`);
    }
    
    // Check individual files
    results.files.forEach(file => {
        if (file.lines > LIMITS.MAX_FILE_LINES) {
            violations.push(`❌ File too large: ${file.path} (${file.lines}/${LIMITS.MAX_FILE_LINES} lines)`);
        }
        
        if (file.antiPatterns.length > 0) {
            violations.push(`❌ Anti-patterns in ${file.path}:`);
            file.antiPatterns.forEach(pattern => {
                violations.push(`   • ${pattern}`);
            });
        }
    });
    
    // Report results
    console.log('📊 Complexity Metrics:');
    console.log(`   Files: ${results.files.length}/${LIMITS.MAX_TOTAL_FILES}`);
    console.log(`   Total Lines: ${results.totalLines}/${LIMITS.MAX_TOTAL_LINES}`);
    console.log('');
    
    console.log('📋 File Breakdown:');
    results.files
        .sort((a, b) => b.lines - a.lines)
        .forEach(file => {
            const status = file.lines > LIMITS.MAX_FILE_LINES ? '❌' : '✅';
            console.log(`   ${status} ${file.path}: ${file.lines} lines`);
        });
    console.log('');
    
    if (violations.length === 0) {
        console.log('✅ All complexity checks passed!');
        console.log('🎯 V2 architecture is healthy.');
        return true;
    } else {
        console.log('🚨 COMPLEXITY VIOLATIONS DETECTED:');
        violations.forEach(violation => console.log(violation));
        console.log('');
        console.log('🛑 STOP DEVELOPMENT - Fix violations before continuing');
        console.log('📋 Review MANDATORY_CHECKLIST.md before making changes');
        return false;
    }
}

// Run the check
const passed = runComplexityCheck();
process.exit(passed ? 0 : 1);