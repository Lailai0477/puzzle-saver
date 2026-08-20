(() => {
  const requestEvent = "puzzle-saver-request";
  const responseEvent = "puzzle-saver-response";

  // Content scripts run in an isolated world. The bridge runs in the page's
  // world, where puzz.link exposes `pzpr` and its active Puzzle instance.
  const bridge = document.createElement("script");
  bridge.src = chrome.runtime.getURL("page-bridge.js");
  bridge.onload = () => {
    bridge.remove();
    const beginPendingRestore = () => {
      chrome.runtime.sendMessage({ type: "puzzle-saver-ready", url: location.href }, (pending) => {
        if (pending?.data) restoreWhenPuzzleIsReady(pending.data);
      });
    };

    // pzpr-ui initializes some pages from window.onload. Wait for that phase,
    // then leave a short margin before asking the page to restore its state.
    const startAfterPageLoad = () => setTimeout(beginPendingRestore, 300);
    if (document.readyState === "complete") startAfterPageLoad();
    else window.addEventListener("load", startAfterPageLoad, { once: true });
  };

  function restoreWhenPuzzleIsReady(data, attempts = 0) {
    askPage("restore:" + data).then((result) => {
      if (result?.ok) {
        chrome.runtime.sendMessage({ type: "puzzle-saver-restored", url: location.href });
      } else if (attempts < 20) {
        setTimeout(() => restoreWhenPuzzleIsReady(data, attempts + 1), 500);
      }
    });
  }
  (document.head || document.documentElement).appendChild(bridge);

  function askPage(action) {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        document.removeEventListener(responseEvent, onResponse);
        resolve({ ok: false, error: "このページには対応するパズルが見つかりません。" });
      }, 1200);

      function onResponse(event) {
        if (event.detail?.requestId !== requestId) return;
        clearTimeout(timeout);
        document.removeEventListener(responseEvent, onResponse);
        resolve(event.detail);
      }

      document.addEventListener(responseEvent, onResponse);
      document.dispatchEvent(new CustomEvent(requestEvent, { detail: { requestId, action } }));
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "puzzle-saver-export") {
      askPage("export").then(sendResponse);
      return true;
    }
    if (message?.type === "puzzle-saver-restore") {
      askPage("restore:" + message.data).then(sendResponse);
      return true;
    }
  });
})();
