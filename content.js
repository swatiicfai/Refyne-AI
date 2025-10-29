console.log("Refyne content script loaded");

const tooltip = document.createElement("div");
Object.assign(tooltip.style, {
    position: "fixed",
    background: "#fff",
    border: "1px solid #ccc",
    padding: "12px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    zIndex: "1000000",
    display: "none",
    fontSize: "14px",
    maxWidth: "400px",
    minWidth: "300px",
    cursor: "pointer",
    fontFamily: "Arial, sans-serif",
    lineHeight: "1.5"
});
document.body.appendChild(tooltip);

let debounceTimeout = null;
let activeTarget = null;
let activeSuggestion = null;
let rewriterInstance = null; // Placeholder for potential AI model
let isDownloading = false;
let isEnabled = true;
let downloadAttempted = false;
let downloadProgress = 0;
let offlineMode = false;
let offlineChecker = null;

// Initialize the offline checker logic (rules-based grammar/typo check)
function initializeOfflineChecker() {
    offlineChecker = {
        rules: [
            {
                name: "subject_verb_agreement",
                // Example: He have, She do, It are
                pattern: /\b(He|She|It)\s+(have|do|are|were)\b/gi,
                replacement: (match, p1, p2) => {
                    const corrections = {
                        'have': 'has', 'do': 'does', 'are': 'is', 'were': 'was'
                    };
                    return `${p1} ${corrections[p2.toLowerCase()] || p2}`;
                }
            },
            {
                name: "common_typos",
                // Example: recieve -> receive, seperate -> separate
                pattern: /\b(recieve|seperate|beleive|thier)\b/gi,
                replacement: (match) => {
                    const corrections = {
                        'recieve': 'receive', 'seperate': 'separate', 'beleive': 'believe', 'thier': 'their'
                    };
                    return corrections[match.toLowerCase()] || match;
                }
            }
        ],
        // Apply offline checks
        check(text) {
            let correctedText = text;
            let corrected = false;
            this.rules.forEach(rule => {
                const newText = correctedText.replace(rule.pattern, (...args) => {
                    // Check if a replacement was actually made
                    const replacement = rule.replacement(...args);
                    if (replacement !== args[0]) {
                        corrected = true;
                    }
                    return replacement;
                });
                correctedText = newText;
            });
            return corrected ? correctedText : null;
        }
    };
}

// Function to simulate getting AI suggestions (or use offline)
async function getSuggestions(text) {
    if (!isEnabled) return null;
    
    // 1. Try Offline Check (for "offline-first AI")
    const offlineSuggestion = offlineChecker.check(text);
    if (offlineSuggestion) {
        offlineMode = true;
        return { corrected: offlineSuggestion, source: 'offline' };
    }
    
    // 2. Try Online AI Check (Simulated)
    if (offlineMode && !isDownloading) {
        // If we are in offline mode (and model is not downloading), we don't try AI
        return null;
    }
    
    // This is where your actual AI API call would go
    if (!offlineMode) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
        return { 
            corrected: `[AI] ${text.replace(/a mistake/i, 'a correction').replace(/\.\s*$/, ', which is much better.')}`,
            source: 'ai'
        };
    }
    
    return null;
}

// Function to handle the actual application of the suggestion
function applySuggestion() {
    if (!activeSuggestion || !activeTarget) return;

    try {
        const originalText = activeTarget.value || activeTarget.textContent;
        
        if (activeTarget.value !== undefined) {
            // For input/textarea
            activeTarget.value = activeSuggestion;
        } else {
            // For content-editable elements
            activeTarget.textContent = activeSuggestion;
        }
        
        // Dispatch an input event to notify frameworks (like React, Vue)
        const event = new Event('input', { bubbles: true });
        activeTarget.dispatchEvent(event);
        
        // Log the correction to the background script to update stats
        chrome.runtime.sendMessage({
            action: 'logCorrection',
            original: originalText,
            corrected: activeSuggestion,
            source: tooltip.dataset.source 
        });
        
        showStatusMessage("Suggestion applied successfully!", "success");
        setTimeout(hideStatusMessage, 2000);
        
    } catch (error) {
        console.error("Error applying suggestion:", error);
        showStatusMessage("Failed to apply suggestion.", "error");
        setTimeout(hideStatusMessage, 3000);
    }
    
    hideTooltip();
}

// Function to display the suggestion tooltip
function showTooltip(content, x, y, source, suggestionText) {
    activeSuggestion = suggestionText;
    tooltip.innerHTML = content;
    tooltip.dataset.source = source;
    
    // Create 'Apply' button
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply Suggestion';
    applyButton.style.cssText = 'display:block;margin-top:10px;padding:5px 10px;background:#4caf50;color:white;border:none;border-radius:4px;cursor:pointer;';
    applyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        applySuggestion();
    });
    tooltip.appendChild(applyButton);
    
    // Position the tooltip
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.display = 'block';
}

// Function to show a status message at the bottom of the screen
function showStatusMessage(message, type) {
    let statusDiv = document.getElementById('refyne-status-message');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'refyne-status-message';
        Object.assign(statusDiv.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            padding: '10px 15px',
            borderRadius: '5px',
            zIndex: '1000001',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            display: 'block'
        });
        document.body.appendChild(statusDiv);
    }
    
    const colors = {
        'info': '#2196F3',
        'success': '#4caf50',
        'error': '#f44336',
        'warning': '#ff9800'
    };
    
    statusDiv.style.backgroundColor = colors[type] || colors['info'];
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
}

// Function to hide the status message
function hideStatusMessage() {
    const statusDiv = document.getElementById('refyne-status-message');
    if (statusDiv) {
        statusDiv.style.display = 'none';
    }
}

// Global initialization
initializeOfflineChecker();
chrome.runtime.sendMessage({ action: 'checkEnabled' }, response => {
    isEnabled = response.enabled;
    console.log(`Refyne is initially ${isEnabled ? 'enabled' : 'disabled'}`);
});


// Context Menu Listener
document.addEventListener('contextmenu', (e) => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        // Active target is the element that holds the selected text
        activeTarget = e.target.closest('input, textarea, [contenteditable="true"]') || e.target;
        
        // Check text immediately when context menu is opened
        if (isEnabled) {
            getSuggestions(selectedText).then(suggestion => {
                if (suggestion && suggestion.corrected !== selectedText) {
                    // Send message to background script to add a context menu item
                    chrome.runtime.sendMessage({ 
                        action: 'showSuggestionInContextMenu', 
                        original: selectedText, 
                        corrected: suggestion.corrected,
                        source: suggestion.source
                    });
                } else {
                    // Remove any old context menu items if no suggestion is found
                    chrome.runtime.sendMessage({ action: 'clearContextMenu' });
                }
            });
        }
    }
}, true);


// Message listener for background script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === 'enabledStateChanged') {
        isEnabled = request.enabled;
        showStatusMessage(`Refyne is now ${isEnabled ? 'enabled' : 'disabled'}`, isEnabled ? "success" : "warning");
        setTimeout(hideStatusMessage, 2000);
    }
    
    if (request.action === 'getAIStatus') {
        // Send back the current AI/offline status
        const status = {
            mode: offlineMode ? (isDownloading ? 'downloadable' : 'offline') : 'ready',
            message: offlineMode ? (isDownloading ? 'Downloading AI Model...' : '🔒 Offline Mode (Rules only)') : '✨ AI Ready (Online)'
        };
        sendResponse(status);
        return true; 
    }
    
    // Check text for non-context menu logic (e.g., direct popup request)
    if (request.action === 'checkText' && request.text) {
        showStatusMessage("Checking selected text...", "info");
        // Set the active target before getting suggestions
        activeTarget = document.activeElement; 
        getSuggestions(request.text).then(suggestion => {
            if (suggestion) {
                const source = suggestion.source || (offlineMode ? "offline" : "ai");
                const titleColor = source === "offline" ? "#FF9800" : "#4caf50";
                const titleText = source === "offline" ? "Refyne Offline Suggestion" : "Refyne AI Suggestion";
                
                showTooltip(
                    `<div style="font-weight:bold;color:${titleColor};margin-bottom:8px;">${titleText}</div>
                     <div>${suggestion.corrected}</div>`,
                    window.innerWidth / 2,
                    window.innerHeight / 2,
                    source,
                    suggestion.corrected 
                );
                
            } else {
                showStatusMessage("No suggestions available", "info");
                setTimeout(hideStatusMessage, 3000);
            }
        });
        return true;
    }
});
