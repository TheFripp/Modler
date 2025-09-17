#!/usr/bin/env node
/**
 * Modler V2 Health Check Script
 * Validates project setup and provides development status
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Status symbols
const symbols = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: '📋'
};

class HealthChecker {
  constructor() {
    this.projectRoot = path.dirname(__dirname);
    this.checks = [];
    this.warnings = [];
    this.errors = [];
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  success(message) {
    this.log(`${symbols.success} ${message}`, 'green');
    this.checks.push({ type: 'success', message });
  }

  warning(message) {
    this.log(`${symbols.warning} ${message}`, 'yellow');
    this.warnings.push(message);
    this.checks.push({ type: 'warning', message });
  }

  error(message) {
    this.log(`${symbols.error} ${message}`, 'red');
    this.errors.push(message);
    this.checks.push({ type: 'error', message });
  }

  info(message) {
    this.log(`${symbols.info} ${message}`, 'blue');
  }

  checkFileExists(filePath, description) {
    const fullPath = path.join(this.projectRoot, filePath);
    if (fs.existsSync(fullPath)) {
      this.success(`${description} exists`);
      return true;
    } else {
      this.error(`${description} missing: ${filePath}`);
      return false;
    }
  }

  checkFolderExists(folderPath, description) {
    const fullPath = path.join(this.projectRoot, folderPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      this.success(`${description} folder exists`);
      return true;
    } else {
      this.error(`${description} folder missing: ${folderPath}`);
      return false;
    }
  }

  checkDocumentationStructure() {
    this.info('\n📚 Checking Documentation Structure...');
    
    const requiredDocs = [
      ['README.md', 'Main README'],
      ['QUICK_START.md', 'Quick Start Guide'],
      ['PROJECT_CONTEXT.md', 'Project Context'],
      ['V1_LESSONS.md', 'V1 Lessons Learned'],
      ['ARCHITECTURE_V2.md', 'V2 Architecture'],
      ['IMPLEMENTATION_PLAN_V2.md', 'Implementation Plan']
    ];

    let allDocsExist = true;
    requiredDocs.forEach(([file, desc]) => {
      if (!this.checkFileExists(file, desc)) {
        allDocsExist = false;
      }
    });

    return allDocsExist;
  }

  checkAgentStructure() {
    this.info('\n🤖 Checking Agent Structure...');
    
    const requiredAgents = [
      'architecture-guardian',
      'implementation-specialist', 
      'documentation-keeper',
      'system-health-monitor'
    ];

    let allAgentsExist = true;
    requiredAgents.forEach(agent => {
      const agentFolder = `agents/${agent}`;
      const instructionsFile = `${agentFolder}/AGENT_INSTRUCTIONS.md`;
      
      if (this.checkFolderExists(agentFolder, `${agent} agent`)) {
        if (!this.checkFileExists(instructionsFile, `${agent} instructions`)) {
          allAgentsExist = false;
        }
      } else {
        allAgentsExist = false;
      }
    });

    return allAgentsExist;
  }

  checkScriptsStructure() {
    this.info('\n⚙️ Checking Scripts Structure...');
    
    const requiredScripts = [
      ['scripts/health-check.js', 'Health Check Script'],
      ['scripts/setup-dev-server.js', 'Development Server Setup']
    ];

    let allScriptsExist = true;
    requiredScripts.forEach(([file, desc]) => {
      if (!this.checkFileExists(file, desc)) {
        allScriptsExist = false;
      }
    });

    return allScriptsExist;
  }

  checkImplementationProgress() {
    this.info('\n📈 Checking Implementation Progress...');
    
    const implementationPlanPath = path.join(this.projectRoot, 'IMPLEMENTATION_PLAN_V2.md');
    if (!fs.existsSync(implementationPlanPath)) {
      this.error('Implementation plan not found');
      return false;
    }

    const content = fs.readFileSync(implementationPlanPath, 'utf8');
    
    // Count task status
    const notStarted = (content.match(/⭕ NOT STARTED/g) || []).length;
    const inProgress = (content.match(/🟡 IN PROGRESS/g) || []).length;
    const completed = (content.match(/✅ COMPLETED/g) || []).length;
    
    const total = notStarted + inProgress + completed;
    
    if (total === 0) {
      this.warning('No tasks found in implementation plan');
    } else {
      this.success(`Found ${total} tasks: ${completed} completed, ${inProgress} in progress, ${notStarted} not started`);
      
      if (completed === 0 && inProgress === 0) {
        this.info('🚀 Ready to start V2 implementation!');
      } else if (inProgress > 0) {
        this.info('🔄 Development in progress...');
      } else if (completed > 0) {
        this.info(`🎉 ${completed} tasks completed!`);
      }
    }

    return true;
  }

  checkV1Context() {
    this.info('\n🏗️ Checking V1 Context...');
    
    // Check if V1 codebase exists for reference
    const v1Path = path.resolve(this.projectRoot, '../');
    const v1MainPath = path.join(v1Path, 'js/main.js');
    
    if (fs.existsSync(v1MainPath)) {
      this.success('V1 codebase available for reference');
    } else {
      this.warning('V1 codebase not found - may need to adjust paths in documentation');
    }

    return true;
  }

  generateSummaryReport() {
    this.log('\n' + '='.repeat(60), 'bold');
    this.log('📊 HEALTH CHECK SUMMARY', 'bold');
    this.log('='.repeat(60), 'bold');

    const totalChecks = this.checks.length;
    const successCount = this.checks.filter(c => c.type === 'success').length;
    const warningCount = this.warnings.length;
    const errorCount = this.errors.length;

    this.log(`\n📈 Results: ${successCount}/${totalChecks} checks passed`);
    
    if (errorCount === 0) {
      this.success('✅ Project setup is healthy!');
    } else {
      this.error(`❌ ${errorCount} critical issues need attention`);
    }

    if (warningCount > 0) {
      this.warning(`⚠️ ${warningCount} warnings to review`);
    }

    // Status assessment
    if (errorCount === 0 && warningCount === 0) {
      this.log('\n🚀 STATUS: Ready for development', 'green');
    } else if (errorCount === 0) {
      this.log('\n⚠️ STATUS: Mostly ready, review warnings', 'yellow');
    } else {
      this.log('\n❌ STATUS: Setup incomplete, fix errors first', 'red');
    }

    // Next steps
    this.log('\n📋 RECOMMENDED NEXT STEPS:', 'bold');
    
    if (errorCount > 0) {
      this.log('1. Fix critical errors listed above');
      this.log('2. Re-run health check');
    } else {
      this.log('1. Choose your specialized agent role');
      this.log('2. Read your agent instructions');
      this.log('3. Check IMPLEMENTATION_PLAN_V2.md for current priorities');
      this.log('4. Start development with Phase 1 tasks');
    }

    this.log('\n📚 QUICK COMMANDS:');
    this.log('   Read quick start: cat QUICK_START.md');
    this.log('   Check progress:   head -50 IMPLEMENTATION_PLAN_V2.md');
    this.log('   Start dev server: node scripts/setup-dev-server.js');
    
    return errorCount === 0;
  }

  async run() {
    this.log('🔍 Running Modler V2 Health Check...\n', 'bold');

    // Run all checks
    const results = [
      this.checkDocumentationStructure(),
      this.checkAgentStructure(), 
      this.checkScriptsStructure(),
      this.checkImplementationProgress(),
      this.checkV1Context()
    ];

    // Generate summary
    const healthy = this.generateSummaryReport();
    
    // Exit code for CI/automation
    process.exit(healthy ? 0 : 1);
  }
}

// Run health check if called directly
if (require.main === module) {
  const checker = new HealthChecker();
  checker.run().catch(console.error);
}

module.exports = HealthChecker;