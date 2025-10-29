console.log("Refyne background service worker initialized");

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    autoCheck: true,
    correctionsCount: 0,
    wordsImproved: 0,
    installDate: Date.now(),
    version: '2.0.2'
  });
  
  // Initialize default text expansion settings
  chrome.storage.sync.get(['textExpansion'], (result) => {
    if (!result.textExpansion) {
      chrome.storage.sync.set({
        textExpansion: {
          enabled: true,
          shortcuts: [
            {"trigger": "thank", "expansion": "Thank you for your message!"},
            {"trigger": "regards", "expansion": "Best regards,"},
            {"trigger": "meeting", "expansion": "I'd be happy to schedule a meeting with you."}
          ]
        }
      });
    }
  });
  
  // Initialize default translation settings
  chrome.storage.sync.get(['translation'], (result) => {
    if (!result.translation) {
      chrome.storage.sync.set({
        translation: {
          enabled: true,
          nativeLanguage: 'en',
          translationMode: 'auto',
          displayOptions: {
            showOriginal: true,
            showTranslation: true,
            showLanguageBadge: true,
            replaceOriginal: false
          }
        }
      });
    }
  });
  
  // Initialize default TTS setting
  chrome.storage.sync.get(['enableTTS'], (result) => {
    if (result.enableTTS === undefined) {
      chrome.storage.sync.set({ enableTTS: false });
    }
  });
});

// Listener for messages from content scripts (e.g., when a suggestion is applied)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Handle action to log a correction for stats
  if (request.action === 'logCorrection' && request.original && request.corrected) {
    chrome.storage.local.get(['correctionsCount', 'wordsImproved'], (result) => {
      // Update corrections count
      const newCorrections = (result.correctionsCount || 0) + 1;
      
      // Update words improved count (based on word difference)
      const originalWords = request.original.split(/\s+/).length;
      const correctedWords = request.corrected.split(/\s+/).length;
      // Simple word change count
      const wordsChanged = Math.abs(correctedWords - originalWords); 
      const newWords = (result.wordsImproved || 0) + wordsChanged;

      chrome.storage.local.set({
        correctionsCount: newCorrections,
        wordsImproved: newWords
      });
      
      // Update the badge text
      try {
        if (chrome.action && chrome.action.setBadgeText) {
          chrome.action.setBadgeText({ 
            text: newCorrections > 0 ? String(newCorrections) : 'ON' 
          });
          chrome.action.setBadgeBackgroundColor({
              color: '#4caf50' 
          });
        }
      } catch (error) {
        console.log('Badge update failed:', error);
      }
      
      console.log(`Correction applied (${request.source || 'ai'}):`, {
        original: request.original,
        corrected: request.corrected
      });
    });

    sendResponse({ success: true });
  }

  // Handle action to check extension enabled state
  if (request.action === 'checkEnabled') {
    chrome.storage.local.get('enabled', ({ enabled }) => {
      sendResponse({ enabled: enabled !== false });
    });
    return true; 
  }

  // Handle action to get stats
  if (request.action === 'getStats') {
    chrome.storage.local.get(['correctionsCount', 'wordsImproved'], (result) => {
      sendResponse({
        correctionsCount: result.correctionsCount || 0,
        wordsImproved: result.wordsImproved || 0
      });
    });
    return true; 
  }
});
