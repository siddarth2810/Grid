const OVERLAY_FILES = ['defaults.js', 'content.js'];

async function sendToTab(tabId, message) {
  // The content script guards against double-loading, so injecting every time is safe.
  await chrome.scripting.executeScript({ target: { tabId }, files: OVERLAY_FILES });
  return chrome.tabs.sendMessage(tabId, message);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;
  const type = command === 'toggle-draw' ? 'toggleDraw' : 'toggle';
  try {
    await sendToTab(tab.id, { type });
  } catch {
    // chrome:// pages, the Web Store, etc. can't be scripted.
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'status' || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.drawing ? 'DRAW' : msg.visible ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: msg.drawing ? '#ff2d55' : '#3a3647' });
  chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
});

// A reload drops the overlay, so drop the badge with it.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') chrome.action.setBadgeText({ tabId, text: '' });
});
