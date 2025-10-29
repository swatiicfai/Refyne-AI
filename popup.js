document.addEventListener("DOMContentLoaded", async function () {
  const toggle = document.getElementById("toggleEnabled");
  const statusDiv = document.getElementById("status");
  const correctionsCount = document.getElementById("correctionsCount");
  const wordsImproved = document.getElementById("wordsImproved");
  const modeIndicator = document.getElementById("modeIndicator");
  const textExpansionSettings = document.getElementById("textExpansionSettings");
  const translationSettings = document.getElementById("translationSettings");

  chrome.storage.local.get(
    ["enabled", "correctionsCount", "wordsImproved"],
    (result) => {
      toggle.checked = result.enabled !== false;
      correctionsCount.textContent = result.correctionsCount || 0;
      wordsImproved.textContent = result.wordsImproved || 0;
    }
  );

  // Handle text expansion settings link
  if (textExpansionSettings) {
    textExpansionSettings.addEventListener("click", (e) => {
      e.preventDefault();
      // Open the general options page, where text expansion settings are managed
      chrome.runtime.openOptionsPage(); 
    });
  }
  
  // Handle translation settings link
  if (translationSettings) {
    translationSettings.addEventListener("click", (e) => {
      e.preventDefault();
      // Open translation settings page (assuming it's 'options/translation.html')
      chrome.tabs.create({
        url: chrome.runtime.getURL('options/translation.html')
      });
    });
  }

  async function checkAIStatus() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tabs.length === 0 || !tabs[0].id) {
        updateStatus("unavailable", "No active tab.");
        return;
      }

      // Send message to the content script to get its AI/Offline status
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: "getAIStatus",
      });

      if (response && response.mode) {
        updateStatus(response.mode, response.message);
      } else {
        updateStatus("unavailable", "Could not check AI status (Content script not ready).");
      }
    } catch (error) {
      // Check if the error is due to the content script not being loaded
      if (error.message.includes("Could not establish connection")) {
        updateStatus("unavailable", "Extension not loaded on this page. Reload page.");
      } else {
        updateStatus("unavailable", "Error checking AI status.");
      }
      console.error("Error checking AI status:", error);
    }
  }

  function updateStatus(mode, message) {
    // Update the indicator text
    modeIndicator.textContent = message.includes("Offline") ? "🔒 Offline" : (message.includes("AI Ready") ? "✨ Online" : "❌ Error");

    switch (mode) {
      case "ready":
        statusDiv.className = "status ready";
        statusDiv.textContent = "✅ " + message;
        break;
      case "downloadable":
        statusDiv.className = "status downloading";
        statusDiv.textContent = "⏳ " + message;
        break;
      case "offline":
      case "unavailable":
      default:
        statusDiv.className = "status error";
        statusDiv.textContent = "🔒 " + message;
        break;
    }
  }
  
  const toggleTTS = document.getElementById("toggleTTS");

  chrome.storage.sync.get(["enableTTS"], (result) => {
    // Corrected to ensure default is false if not set
    toggleTTS.checked = result.enableTTS === true; 
  });

  toggleTTS.addEventListener("change", function () {
    chrome.storage.sync.set({ enableTTS: this.checked });
  });
  
  checkAIStatus(); // Initial status check

  toggle.addEventListener("change", function () {
    chrome.storage.local.set({ enabled: this.checked }, () => {
      // Set badge text to ON/OFF
      chrome.action.setBadgeText({ text: this.checked ? "ON" : "OFF" });
      chrome.action.setBadgeBackgroundColor({
        color: this.checked ? "#4caf50" : "#666",
      });

      // Notify content scripts of state change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: "enabledStateChanged",
              enabled: this.checked,
            })
            .catch((err) => console.log("Tab message failed:", err));
        }
      });
    });
  });

  // Re-fetch stats on load
  chrome.storage.local.get(["correctionsCount", "wordsImproved"], (result) => {
    correctionsCount.textContent = result.correctionsCount || 0;
    wordsImproved.textContent = result.wordsImproved || 0;
  });
});
