(() => {
  const requestEvent = "puzzle-saver-request";
  const responseEvent = "puzzle-saver-response";

  function activePuzzle() {
    // puzz.link uses ui.puzzle; keeping the fallback supports pages that
    // create a Puzzle instance without the standard pzpr-ui wrapper.
    return window.ui?.puzzle || window.puzzle || null;
  }

  function respond(requestId, result) {
    document.dispatchEvent(new CustomEvent(responseEvent, {
      detail: { requestId, ...result }
    }));
  }

  document.addEventListener(requestEvent, (event) => {
    const { requestId, action } = event.detail || {};
    const puzzle = activePuzzle();
    if (!puzzle || !window.pzpr?.parser) {
      respond(requestId, { ok: false, error: "pzpr のパズルを検出できませんでした。" });
      return;
    }

    try {
      if (action === "export") {
        const data = puzzle.getFileData(window.pzpr.parser.FILE_PZPR, { history: true });
        respond(requestId, {
          ok: true,
          data,
          puzzleId: puzzle.pid || "unknown",
          title: document.title
        });
        return;
      }

      if (action?.startsWith("restore:")) {
        puzzle.open(action.slice("restore:".length));
        respond(requestId, { ok: true });
        return;
      }
      respond(requestId, { ok: false, error: "不明な操作です。" });
    } catch (error) {
      respond(requestId, { ok: false, error: error.message || "保存に失敗しました。" });
    }
  });
})();
