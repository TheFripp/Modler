/**
 * Modler V2 - Logging System
 *
 * Provides configurable logging levels to reduce console spam in production
 * and improve runtime performance.
 *
 * ARCHITECTURE:
 * - Single global logger instance
 * - Environment-aware level configuration
 * - Zero overhead when disabled
 * - Compatible with existing console.log usage
 */

class Logger {
    constructor(level = 'INFO') {
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            NONE: 4
        };

        this.levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
        this.currentLevel = this.levels[level] ?? this.levels.INFO;

        // Performance optimization: Pre-bind methods
        this.debug = this.debug.bind(this);
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
    }

    /**
     * Set logging level
     * @param {string} level - DEBUG, INFO, WARN, ERROR, or NONE
     */
    setLevel(level) {
        const upperLevel = level.toUpperCase();
        if (this.levels.hasOwnProperty(upperLevel)) {
            this.currentLevel = this.levels[upperLevel];
        } else {
            console.warn(`Invalid log level: ${level}. Using INFO.`);
            this.currentLevel = this.levels.INFO;
        }
    }

    /**
     * Get current logging level name
     */
    getLevel() {
        return this.levelNames[this.currentLevel] || 'UNKNOWN';
    }

    /**
     * Debug logging - verbose information for development
     * Only logged when level is DEBUG
     */
    debug(...args) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    }

    /**
     * Info logging - general information
     * Logged when level is DEBUG or INFO
     */
    info(...args) {
        if (this.currentLevel <= this.levels.INFO) {
            console.log('[INFO]', ...args);
        }
    }

    /**
     * Warning logging - potential issues
     * Logged when level is DEBUG, INFO, or WARN
     */
    warn(...args) {
        if (this.currentLevel <= this.levels.WARN) {
            console.warn('[WARN]', ...args);
        }
    }

    /**
     * Error logging - critical issues
     * Always logged (except when level is NONE)
     */
    error(...args) {
        if (this.currentLevel <= this.levels.ERROR) {
            console.error('[ERROR]', ...args);
        }
    }

    /**
     * Group logging - create collapsible group
     */
    group(label) {
        if (this.currentLevel <= this.levels.INFO) {
            console.group(label);
        }
    }

    /**
     * End group logging
     */
    groupEnd() {
        if (this.currentLevel <= this.levels.INFO) {
            console.groupEnd();
        }
    }

    /**
     * Performance timing - start timer
     */
    time(label) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.time(label);
        }
    }

    /**
     * Performance timing - end timer
     */
    timeEnd(label) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.timeEnd(label);
        }
    }

    /**
     * Table logging - display data in table format
     */
    table(data) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.table(data);
        }
    }
}

// Create global logger instance
// Auto-detect environment (development vs production)
const isDevelopment = window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1' ||
                     window.location.port !== '';

const defaultLevel = isDevelopment ? 'DEBUG' : 'WARN';
const logger = new Logger(defaultLevel);

// Expose globally
window.logger = logger;
window.Logger = Logger;

// Log initial configuration
logger.info(`Logger initialized with level: ${logger.getLevel()} (${isDevelopment ? 'development' : 'production'} mode)`);
