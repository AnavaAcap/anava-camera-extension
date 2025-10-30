/**
 * TEST VERSION - Minimal background script
 */

console.log('[Background] TEST: Script started loading...');

try {
  // Test listener
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    console.log('[Background] TEST: Received message:', message);
    console.log('[Background] TEST: From origin:', sender.origin);

    sendResponse({ success: true, test: 'working' });
    return true;
  });

  console.log('[Background] TEST: Listener registered successfully');
} catch (error) {
  console.error('[Background] TEST: Error setting up listener:', error);
}

console.log('[Background] TEST: Script loaded successfully');
