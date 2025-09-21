// Tab system functionality
class TabSystem {
    constructor() {
        this.init();
    }

    init() {
        this.setupTabButtons();
        this.switchTab('objects'); // Default to objects tab
    }

    setupTabButtons() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach((button, index) => {
            const tabName = index === 0 ? 'objects' : 'settings';
            button.addEventListener('click', () => this.switchTab(tabName));
            button.setAttribute('data-tab', tabName);
        });
    }

    switchTab(tabName) {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

        // Add active class to selected tab and pane
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        const tabPane = document.getElementById(`${tabName}-tab`);

        if (tabButton) tabButton.classList.add('active');
        if (tabPane) tabPane.classList.add('active');
    }
}

// Initialize tab system when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.tabSystem = new TabSystem();
});

// Make switchTab function globally available for backward compatibility
window.switchTab = function(tabName) {
    if (window.tabSystem) {
        window.tabSystem.switchTab(tabName);
    }
};