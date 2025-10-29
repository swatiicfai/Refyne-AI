// Autofill Injector Content Script
(function() {
  
  // =========================================================================
  // CORRECTION/IMPROVEMENT: Replaced simple word-overlap with a more robust
  // bigram-based similarity check (Sørensen–Dice coefficient) for better 
  // form label matching.
  // =========================================================================
  function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    // Normalize: lowercase and remove spaces/non-alphanumeric characters
    str1 = str1.toLowerCase().replace(/[^a-z0-9]/g, ''); 
    str2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (str1.length === 0 || str2.length === 0) return 0;
    if (str1 === str2) return 1.0;

    const s1 = new Set();
    for (let i = 0; i < str1.length - 1; i++) {
      s1.add(str1.substring(i, i + 2));
    }

    const s2 = new Set();
    for (let i = 0; i < str2.length - 1; i++) {
      s2.add(str2.substring(i, i + 2));
    }
    
    if (s1.size === 0 || s2.size === 0) return 0; // Avoid division by zero if input is too short
    
    const intersection = new Set([...s1].filter(x => s2.has(x)));
    
    // Sørensen–Dice coefficient calculation
    return (2 * intersection.size) / (s1.size + s2.size);
  }

  // Find the best matching saved entry for a question
  function findBestMatch(question, savedEntries) {
    let bestMatch = null;
    let bestScore = 0;
    
    // Lowered threshold to 0.4, as bigram similarity is more precise but scores lower
    const MATCH_THRESHOLD = 0.4; 
    
    savedEntries.forEach(entry => {
      const score = calculateSimilarity(question, entry.question);
      if (score > bestScore && score >= MATCH_THRESHOLD) { 
        bestScore = score;
        bestMatch = entry;
      }
    });
    
    return bestMatch;
  }

  // Create and inject the autofill icon
  function createAutofillIcon(input, savedEntry) {
    // Create the icon element
    const icon = document.createElement('span');
    icon.innerHTML = ' 🤖 Autofill';
    icon.style.cssText = 'cursor:pointer; margin-left:8px; padding:2px 6px; background:#4285f4; color:white; border-radius:4px; font-size:12px; font-weight:bold; display:inline-block;';
    icon.title = `Autofill with saved value: "${savedEntry.answer}"`;

    icon.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Update the input field value
      input.value = savedEntry.answer;
      
      // Manually dispatch an input event to notify frameworks (like React) of the change
      const inputEvent = new Event('input', { bubbles: true });
      input.dispatchEvent(inputEvent);

      // Remove the icon after successful autofill
      icon.remove(); 
      
      console.log('Autofill: Injected value into input.');
    });

    return icon;
  }

  // Check if an element is one of the supported input types
  function isSupportedInput(element) {
    const tagName = element.tagName;
    const type = element.type;
    return (
      (tagName === 'INPUT' && (type === 'text' || type === 'email' || type === 'tel' || type === 'password')) ||
      (tagName === 'TEXTAREA')
    );
  }

  // Global flag to hold saved entries
  let savedEntries = [];
  
  // Load saved entries from storage
  function loadSavedEntries(callback) {
    chrome.storage.sync.get(['savedEntries', 'autofillEnabled'], function(result) {
      if (result.autofillEnabled === false) return;
      savedEntries = result.savedEntries || [];
      if (callback) callback();
    });
  }
  
  // Main logic to find the best match and inject the icon
  function processInputForAutofill(input) {
    // Only process fields that are empty, visible, and haven't been processed
    if (input.value || input.dataset.autofillProcessed || input.style.display === 'none' || input.type === 'hidden') {
      return;
    }

    input.dataset.autofillProcessed = 'true'; // Mark as processed
    
    let question = ''; // Field label text
    
    // 1. Try to find a label with the 'for' attribute pointing to this input
    const id = input.id;
    if (id) {
      const label = document.querySelector(`label[for=\"${id}\"]`);
      if (label) {
        question = label.textContent.trim();
      }
    }
    
    // 2. If not found, try to find the closest preceding label or element with text
    if (!question) {
      let sibling = input.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === 'LABEL' || sibling.textContent.trim().length > 0) {
          question = sibling.textContent.trim();
          break;
        }
        sibling = sibling.previousElementSibling;
      }
    }
    
    // 3. Check parent elements for labels
    if (!question) {
      const parent = input.parentElement;
      if (parent) {
        const label = parent.querySelector('label');
        if (label) {
          question = label.textContent.trim();
        }
      }
    }
    
    // 4. Try placeholder or name attribute as a last resort
    if (!question && input.placeholder) {
        question = input.placeholder.trim();
    } else if (!question && input.name) {
        question = input.name.trim().replace(/[-_]/g, ' ');
    }
    
    // If we have a question, try to find a matching saved entry
    if (question) {
      const bestMatch = findBestMatch(question, savedEntries);
      
      if (bestMatch) {
        // Only inject if an icon for this field does not already exist
        if (!input.nextElementSibling || !input.nextElementSibling.classList.contains('autofill-icon')) {
            const icon = createAutofillIcon(input, bestMatch);
            icon.classList.add('autofill-icon'); 
            input.parentNode.insertBefore(icon, input.nextSibling);
        }
      }
    }
  }

  // Initialize by loading entries and observing DOM
  loadSavedEntries(() => {
    // Process all existing inputs on the page first
    document.querySelectorAll('input, textarea').forEach(input => {
      if (isSupportedInput(input)) {
        processInputForAutofill(input);
      }
    });
    
    // We observe the body to catch dynamically loaded forms/inputs
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check the added node itself
              if (isSupportedInput(node)) {
                processInputForAutofill(node);
              } 
              // Check any children that are inputs
              node.querySelectorAll && node.querySelectorAll('input, textarea').forEach(input => {
                if (isSupportedInput(input)) {
                  processInputForAutofill(input);
                }
              });
            }
          });
        }
      });
    });
    
    // Start observing for future changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  // Listen for storage changes to instantly update saved entries
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.savedEntries) {
      savedEntries = changes.savedEntries.newValue || [];
      // No re-scan needed on change; new fields will be processed by MutationObserver.
    }
    if (area === 'sync' && changes.autofillEnabled) {
      if (changes.autofillEnabled.newValue === false) {
        // Logic to remove all injected icons if autofill is disabled
        document.querySelectorAll('.autofill-icon').forEach(icon => icon.remove());
      }
    }
  });

})();
