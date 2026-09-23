// The toolbar action opens the movable on-page window, not a browser popup.
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ekt-design-open' });
  } catch {
    // The active tab may not be ekt.kz or may predate the extension update.
    // Show a small help page rather than silently opening an immovable popup.
    await chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  }
});
