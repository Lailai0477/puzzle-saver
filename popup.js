const statusEl = document.querySelector("#status");
const snapshotsEl = document.querySelector("#snapshots");
const slotsKey = "puzzle-saver:slots";
const slotsPerPage = 25;
const slotCount = 50;
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
let tab;
let currentPage = 0;

function setStatus(message) { statusEl.textContent = message; }

function getPuzzLinkUrl(slot) {
  if (slot.puzzLinkUrl) return slot.puzzLinkUrl;
  try {
    const sourceUrl = new URL(slot.url);
    const puzzleQuery = sourceUrl.search.slice(1);
    return sourceUrl.hostname === "pzv.jp" && puzzleQuery
      ? `https://puzz.link/p?${puzzleQuery}`
      : null;
  } catch (_error) {
    return null;
  }
}

function send(message) {
  return new Promise((resolve) => chrome.tabs.sendMessage(tab.id, message, resolve));
}

async function readSlots() {
  const { [slotsKey]: saved = Array(slotCount).fill(null) } = await chrome.storage.local.get(slotsKey);
  return Array.from({ length: slotCount }, (_, index) => saved[index] || null);
}

async function saveToSlot(index) {
  setStatus("パズルの状態を読み取っています…");
  const result = await send({ type: "puzzle-saver-export" });
  if (!result?.ok) {
    setStatus(result?.error || "保存できませんでした。ページを再読み込みしてお試しください。");
    return;
  }
  const slots = await readSlots();
  slots[index] = {
    savedAt: Date.now(), data: result.data, puzzleId: result.puzzleId,
    title: result.title, mode: result.mode, url: tab.url,
    puzzLinkUrl: result.puzzLinkUrl
  };
  await chrome.storage.local.set({ [slotsKey]: slots });
  setStatus(`スロット ${index + 1} に保存しました。`);
  renderSlots();
}

async function loadSlot(slot) {
  const notice = slot.mode === "edit" ? "編集モードで開きますか？" : "解答モードで開きますか？";
  if (!confirm(`保存時点の盤面を、${notice}`)) return;
  setStatus("パズルを開いています…");
  if (slot.url === tab.url) {
    const result = await send({ type: "puzzle-saver-restore", data: slot.data });
    setStatus(result?.ok ? "復元しました。" : (result?.error || "復元できませんでした。"));
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: "puzzle-saver-load", tabId: tab.id, url: slot.url, data: slot.data
  });
  if (!result?.ok) setStatus(result?.error || "ページを開けませんでした。");
}

async function loadInPuzzLink(slot) {
  const puzzLinkUrl = getPuzzLinkUrl(slot);
  if (!puzzLinkUrl) {
    setStatus("このパズルはpuzz.link形式のURLに変換できませんでした。");
    return;
  }
  setStatus("puzz.linkでパズルを開いています…");
  const result = await chrome.runtime.sendMessage({
    type: "puzzle-saver-load", url: puzzLinkUrl, data: slot.data
  });
  if (!result?.ok) setStatus(result?.error || "puzz.linkを開けませんでした。");
}

async function renderSlots() {
  const slots = await readSlots();
  snapshotsEl.replaceChildren();
  const firstSlot = currentPage * slotsPerPage;
  slots.slice(firstSlot, firstSlot + slotsPerPage).forEach((slot, pageIndex) => {
    const index = firstSlot + pageIndex;
    const row = document.createElement("div");
    row.className = "snapshot";
    const info = document.createElement("div");
    info.className = "snapshot-info";
    const label = document.createElement("strong");
    label.textContent = `# ${index + 1}`;
    const details = document.createElement("small");
    if (slot) {
      const time = document.createElement("time");
      time.textContent = new Date(slot.savedAt).toLocaleString("ja-JP");
      details.textContent = slot.title || "保存したパズル";
      const url = document.createElement("a");
      url.href = slot.url;
      url.target = "_blank";
      url.rel = "noreferrer";
      url.textContent = slot.url;
      url.title = slot.url;
      info.append(label, time, details, url);
    } else {
      details.textContent = "空きスロット";
      info.append(label, details);
    }
    const save = document.createElement("button");
    save.className = "save";
    save.textContent = slot ? "上書き保存" : "保存";
    save.onclick = () => saveToSlot(index);
    const actions = document.createElement("div");
    actions.className = "snapshot-actions";
    actions.append(save);
    if (slot) {
      const puzzLinkUrl = getPuzzLinkUrl(slot);
      const load = document.createElement("button");
      load.className = slot.mode === "edit" ? "load-edit" : "load-play";
      load.textContent = slot.mode === "edit" ? "ロードして編集" : "ロードして解く";
      load.onclick = () => loadSlot(slot);
      actions.append(load);
      if (puzzLinkUrl) {
        const puzzLink = document.createElement("button");
        puzzLink.className = "load-puzzlink";
        puzzLink.textContent = "puzz.linkで解く";
        puzzLink.onclick = () => loadInPuzzLink(slot);
        actions.append(puzzLink);
      }
    }
    row.append(info, actions);
    snapshotsEl.append(row);
  });
  pageLabel.textContent = `${firstSlot + 1}〜${firstSlot + slotsPerPage} / ${slotCount}`;
  previousPageButton.disabled = currentPage === 0;
  nextPageButton.disabled = currentPage === Math.ceil(slotCount / slotsPerPage) - 1;
}

previousPageButton.onclick = () => {
  currentPage -= 1;
  renderSlots();
};
nextPageButton.onclick = () => {
  currentPage += 1;
  renderSlots();
};

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  renderSlots();
})();
