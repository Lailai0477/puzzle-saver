chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "puzzle-saver-load") {
    // Create an empty tab first so the pending data is ready before the
    // destination page's content script starts.
    chrome.tabs.create({ url: "about:blank", active: true })
      .then((tab) => chrome.storage.session.set({
        pendingRestore: { tabId: tab.id, url: message.url, data: message.data }
      }).then(() => chrome.tabs.update(tab.id, { url: message.url })))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "puzzle-saver-ready") {
    chrome.storage.session.get("pendingRestore").then(({ pendingRestore }) => {
      // The tab is the reliable identity: destination sites may redirect.
      const matches = pendingRestore && pendingRestore.tabId === sender.tab?.id;
      sendResponse(matches ? { data: pendingRestore.data } : {});
    });
    return true;
  }

  if (message?.type === "puzzle-saver-restored") {
    chrome.storage.session.get("pendingRestore").then(({ pendingRestore }) => {
      if (pendingRestore && pendingRestore.tabId === sender.tab?.id) {
        return chrome.storage.session.remove("pendingRestore");
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
