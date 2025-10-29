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
    cursor: "default", 
    fontFamily: "Arial, sans-serif",
    lineHeight: "1.5"
});
document.body.appendChild(tooltip);

let activeTarget = null;
let activeSuggestion = null;
let isEnabled = true;
let offlineMode = false;
let offlineChecker = null;

// Initialize the offline checker logic (rules-based grammar/typo check)
function initializeOfflineChecker() {
    offlineChecker = {
        rules: [
            {
                name: "subject_verb_agreement",
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
    if (offlineSuggestion && offlineSuggestion !== text) {
        offlineMode = true;
        return { corrected: offlineSuggestion, source: 'offline' };
    }
    
    // 2. Try Online AI Check (Simulated for demonstration)
    if (navigator.onLine) {
        offlineMode = false;
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
        return { 
            corrected: `[AI] ${text.charAt(0).toUpperCase() + text.slice(1)}. This is a polished sentence.`,
            source: 'ai'
        };
    }
    
    offlineMode = true;
    return null;
}

function applySuggestion() {
    if (!activeSuggestion || !activeTarget) return;

    try {
        const originalText = activeTarget.value || activeTarget.textContent;
        
        if (activeTarget.value !== undefined) {
            activeTarget.value = activeSuggestion;
        } else {
            activeTarget.textContent = activeSuggestion;
        }
        
        const event = new Event('input', { bubbles: true });
        activeTarget.dispatchEvent(event);
        
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

function showTooltip(content, x, y, source, suggestionText) {
    activeSuggestion = suggestionText;
    tooltip.innerHTML = content;
    tooltip.dataset.source = source;
    
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply Suggestion';
    applyButton.style.cssText = 'display:block;margin-top:10px;padding:5px 10px;background:#4caf50;color:white;border:none;border-radius:4px;cursor:pointer;';
    applyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        applySuggestion();
    });
    tooltip.appendChild(applyButton);
    
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.display = 'block';
}

function hideTooltip() {
    tooltip.style.display = 'none';
    activeSuggestion = null;
    activeTarget = null;
    tooltip.innerHTML = '';
}

function showStatusMessage(message, type) {
    let statusDiv = document.getElementById('refyne-status-message');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'refyne-status-message';
        Object.assign(statusDiv.style, {
            position: 'fixed', bottom: '10px', right: '10px', padding: '10px 15px', borderRadius: '5px', zIndex: '1000001', color: 'white', fontWeight: 'bold', fontSize: '14px', display: 'block'
        });
        document.body.appendChild(statusDiv);
    }
    
    const colors = {
        'info': '#2196F3', 'success': '#4caf50', 'error': '#f44336', 'warning': '#ff9800'
    };
    
    statusDiv.style.backgroundColor = colors[type] || colors['info'];
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
}

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


// Context Menu Listener - sends a request for suggestion to the background script
document.addEventListener('contextmenu', (e) => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        activeTarget = e.target.closest('input, textarea, [contenteditable="true"]') || e.target;
        
        if (isEnabled) {
            getSuggestions(selectedText).then(suggestion => {
                if (suggestion && suggestion.corrected !== selectedText) {
                    showStatusMessage(`Suggestion available: ${suggestion.corrected.substring(0, 30)}...`, "info");
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
    
    // Logic for the popup to check AI Status
    if (request.action === 'getAIStatus') {
        const status = {
            mode: offlineMode ? 'offline' : (navigator.onLine ? 'ready' : 'unavailable'),
            message: offlineMode ? '🔒 Offline Mode (Rules only)' : (navigator.onLine ? '✨ AI Ready (Online)' : '❌ Offline (No AI/Rules)')
        };
        sendResponse(status);
        return true; 
    }
    
    // Logic to show a suggestion on request from the popup (e.g., when clicking the extension icon)
    if (request.action === 'checkText' && request.text) {
        showStatusMessage("Checking selected text...", "info");
        activeTarget = document.activeElement; 
        getSuggestions(request.text).then(suggestion => {
            if (suggestion) {
                const source = suggestion.source || (offlineMode ? "offline" : "ai");
                const titleColor = source === "offline" ? "#FF9800" : "#4caf50";
                const titleText = source === "offline" ? "Refyne Offline Suggestion" : "Refyne AI Suggestion";
                
                showTooltip(
                    `<div style="font-weight:bold;color:${titleColor};margin-bottom:8px;">${titleText}</div>
                     <div>${suggestion.corrected}</div>`,
                    window.innerWidth / 2 - 150, 
                    window.innerHeight / 2 - 50,  
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
