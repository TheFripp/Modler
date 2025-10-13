/**
 * NotificationManager - Native Notification System
 *
 * Displays notifications and dialogs in-app instead of using browser alerts.
 * Styled to match toolbar aesthetic, positioned below toolbar.
 * Supports: info, success, warning, error messages with optional actions.
 */

class NotificationManager {
    constructor() {
        // Container for notifications
        this.container = null;
        this.activeNotifications = new Map();
        this.notificationCounter = 0;

        // Configuration
        this.config = {
            defaultDuration: 5000, // 5 seconds for auto-dismiss
            maxNotifications: 3,
            position: 'top-center' // below toolbar
        };

        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    /**
     * Initialize notification container
     */
    initialize() {
        if (this.container) return;

        // Find toolbar container to append notification below it
        const toolbarContainer = document.getElementById('main-toolbar-container');

        if (!toolbarContainer) {
            console.warn('NotificationManager: Toolbar container not found, falling back to body');
        }

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = 'notification-container';

        // Style container - positioned as next sibling of toolbar
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '100%', // Right below toolbar
            left: '0',
            right: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            pointerEvents: 'none',
            width: '100%',
            marginTop: '4px' // Small gap below toolbar
        });

        // Append to toolbar container so it moves with toolbar
        if (toolbarContainer) {
            toolbarContainer.appendChild(this.container);
        } else {
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show notification
     * @param {Object} options - Notification options
     * @returns {string} Notification ID
     */
    show(options) {
        const {
            type = 'info', // 'info', 'success', 'warning', 'error', 'confirm'
            message,
            title = null,
            duration = type === 'confirm' ? 0 : this.config.defaultDuration,
            actions = [], // Array of {label, callback, style: 'primary'|'secondary'}
            onClose = null
        } = options;

        if (!message) {
            console.warn('NotificationManager: No message provided');
            return null;
        }

        const id = `notification-${++this.notificationCounter}`;
        const notification = this.createNotification(id, type, title, message, actions, duration, onClose);

        this.activeNotifications.set(id, notification);
        this.container.appendChild(notification.element);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.element.classList.add('notification-show');
        });

        // Auto-dismiss if duration > 0
        if (duration > 0) {
            notification.timeout = setTimeout(() => {
                this.dismiss(id);
            }, duration);
        }

        return id;
    }

    /**
     * Create notification element
     * @private
     */
    createNotification(id, type, title, message, actions, duration, onClose) {
        const element = document.createElement('div');
        element.className = `notification notification-${type}`;
        element.dataset.notificationId = id;

        // Apply toolbar-matching styles
        Object.assign(element.style, {
            background: '#171717', // Match toolbar background exactly
            backdropFilter: 'blur(10px)', // Match toolbar blur
            border: '1px solid #2E2E2E', // Match toolbar border
            borderRadius: '24px', // Match toolbar border radius
            padding: '12px 20px',
            width: '100%',
            boxSizing: 'border-box',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)', // Match toolbar shadow
            pointerEvents: 'auto',
            opacity: '0',
            maxHeight: '0',
            overflow: 'hidden',
            transform: 'translateY(-10px)', // Slide down animation
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            color: '#e8e8e8',
            fontSize: '13px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });

        // Header (title + message only)
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        });

        // Title/Message container
        const content = document.createElement('div');
        content.style.flex = '1';

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            Object.assign(titleEl.style, {
                fontWeight: '600',
                fontSize: '14px',
                marginBottom: '4px'
            });
            content.appendChild(titleEl);
        }

        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        Object.assign(messageEl.style, {
            fontSize: '13px',
            lineHeight: '1.5',
            color: 'var(--text-secondary, #b0b0b0)'
        });
        content.appendChild(messageEl);

        header.appendChild(content);
        element.appendChild(header);

        // Actions
        if (actions.length > 0) {
            const actionsContainer = document.createElement('div');
            Object.assign(actionsContainer.style, {
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
                marginTop: '8px'
            });

            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.textContent = action.label;

                const isPrimary = action.style === 'primary';
                Object.assign(btn.style, {
                    padding: '6px 16px',
                    border: isPrimary ? 'none' : '1px solid var(--border-color, #404040)',
                    borderRadius: '4px',
                    background: isPrimary ? 'var(--accent-color, #4a9eff)' : 'transparent',
                    color: isPrimary ? '#ffffff' : 'var(--text-primary, #e0e0e0)',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                });

                btn.addEventListener('mouseenter', () => {
                    btn.style.background = isPrimary
                        ? 'var(--accent-hover, #3a8eef)'
                        : 'var(--bg-hover, #3a3a3a)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.background = isPrimary
                        ? 'var(--accent-color, #4a9eff)'
                        : 'transparent';
                });

                btn.addEventListener('click', () => {
                    if (action.callback) {
                        action.callback();
                    }
                    this.dismiss(id);
                });

                actionsContainer.appendChild(btn);
            });

            element.appendChild(actionsContainer);
        }

        return { element, timeout: null };
    }

    /**
     * Get icon SVG for notification type
     * @private
     */
    getIcon(type) {
        const icons = {
            info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" style="color: #4a9eff"><circle cx="10" cy="10" r="8" stroke-width="2"/><path d="M10 10v4M10 6v1" stroke-width="2" stroke-linecap="round"/></svg>',
            success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" style="color: #4caf50"><circle cx="10" cy="10" r="8" stroke-width="2"/><path d="M7 10l2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" style="color: #ff9800"><path d="M10 2l8 14H2L10 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 8v3M10 13.5v.5" stroke-width="2" stroke-linecap="round"/></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" style="color: #f44336"><circle cx="10" cy="10" r="8" stroke-width="2"/><path d="M7 7l6 6M13 7l-6 6" stroke-width="2" stroke-linecap="round"/></svg>',
            confirm: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" style="color: #9c27b0"><circle cx="10" cy="10" r="8" stroke-width="2"/><path d="M10 6v4M10 13v1" stroke-width="2" stroke-linecap="round"/></svg>'
        };
        return icons[type] || icons.info;
    }

    /**
     * Dismiss notification
     * @param {string} id - Notification ID
     */
    dismiss(id) {
        const notification = this.activeNotifications.get(id);
        if (!notification) return;

        // Clear timeout
        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }

        // Animate out - slide back up under toolbar
        notification.element.classList.remove('notification-show');
        notification.element.style.opacity = '0';
        notification.element.style.maxHeight = '0';
        notification.element.style.padding = '0 20px';

        // Remove after animation
        setTimeout(() => {
            if (notification.element.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
            this.activeNotifications.delete(id);
        }, 300);
    }

    /**
     * Dismiss all notifications
     */
    dismissAll() {
        const ids = Array.from(this.activeNotifications.keys());
        ids.forEach(id => this.dismiss(id));
    }

    /**
     * Show info notification
     */
    info(message, title = null, duration = null) {
        return this.show({ type: 'info', message, title, duration });
    }

    /**
     * Show success notification
     */
    success(message, title = null, duration = null) {
        return this.show({ type: 'success', message, title, duration });
    }

    /**
     * Show warning notification
     */
    warning(message, title = null, duration = null) {
        return this.show({ type: 'warning', message, title, duration });
    }

    /**
     * Show error notification
     */
    error(message, title = null, duration = null) {
        return this.show({ type: 'error', message, title, duration: duration || 8000 });
    }

    /**
     * Show confirmation dialog
     * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
     */
    confirm(message, title = 'Confirm', options = {}) {
        return new Promise((resolve) => {
            const {
                confirmLabel = 'Confirm',
                cancelLabel = 'Cancel',
                confirmStyle = 'primary'
            } = options;

            this.show({
                type: 'confirm',
                title,
                message,
                duration: 0, // Don't auto-dismiss
                actions: [
                    {
                        label: cancelLabel,
                        style: 'secondary',
                        callback: () => resolve(false)
                    },
                    {
                        label: confirmLabel,
                        style: confirmStyle,
                        callback: () => resolve(true)
                    }
                ],
                onClose: () => resolve(false)
            });
        });
    }

    /**
     * Clean up
     */
    destroy() {
        this.dismissAll();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
    }
}

// Add show animation styles - slide down from toolbar position
const style = document.createElement('style');
style.textContent = `
    .notification-show {
        opacity: 1 !important;
        max-height: 200px !important;
        padding: 12px 20px !important;
        transform: translateY(0) !important;
    }
`;
document.head.appendChild(style);

// Export singleton instance
window.notificationManager = new NotificationManager();

// Also make it available on modlerComponents
if (typeof window.modlerComponents !== 'undefined') {
    window.modlerComponents.notificationManager = window.notificationManager;
}
