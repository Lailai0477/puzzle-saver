(() => {
  const requestEvent = "puzzle-saver-request";
  const responseEvent = "puzzle-saver-response";
  const frameRequestType = "puzzle-saver-frame-request";
  const frameResponseType = "puzzle-saver-frame-response";

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
    askPuzzle("restore:" + data).then((result) => {
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

  // Puzzle Square puts puzz.link in a cross-origin iframe. The top-page
  // content script relays requests to each child frame, where this same
  // content script can access the pzpr instance.
  function askPuzzle(action) {
    if (window.top !== window) return askPage(action);

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        window.removeEventListener("message", onFrameResponse);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        finish({ ok: false, error: "このページには対応するパズルが見つかりません。" });
      }, 1500);
      const onFrameResponse = (event) => {
        const message = event.data;
        if (message?.type === frameResponseType && message.requestId === requestId && message.result?.ok) {
          finish(message.result);
        }
      };

      window.addEventListener("message", onFrameResponse);
      for (let index = 0; index < window.frames.length; index += 1) {
        window.frames[index].postMessage({ type: frameRequestType, requestId, action }, "*");
      }
      askPage(action).then((result) => {
        if (result.ok) finish(result);
      });
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (window.top === window || event.source !== window.top || message?.type !== frameRequestType) return;
    askPage(message.action).then((result) => {
      event.source.postMessage({ type: frameResponseType, requestId: message.requestId, result }, "*");
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "puzzle-saver-export") {
      askPuzzle("export").then(sendResponse);
      return true;
    }
    if (message?.type === "puzzle-saver-restore") {
      askPuzzle("restore:" + message.data).then(sendResponse);
      return true;
    }
  });
})();
