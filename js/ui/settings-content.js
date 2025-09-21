// Settings content loader
function loadSettingsContent() {
    const settingsTab = document.getElementById('settings-tab');
    if (!settingsTab) return;

    // Use ConfigFormBuilder to generate the forms
    const formBuilder = new window.ConfigFormBuilder();
    settingsTab.innerHTML = formBuilder.generateContent();
}

// Load settings content when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(loadSettingsContent, 100); // Delay to ensure tab structure is ready
});