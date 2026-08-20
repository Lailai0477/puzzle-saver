const statusEl = document.querySelector("#status");
const snapshotsEl = document.querySelector("#snapshots");
const slotsKey = "puzzle-saver:slots";
let tab;

function setStatus(message) { statusEl.textContent = message; }

function send(message) {
  return new Promise((resolve) => chrome.tabs.sendMessage(tab.id, message, resolve));
}

async function readSlots() {
  const { [slotsKey]: saved = Array(10).fill(null) } = await chrome.storage.local.get(slotsKey);
  return Array.from({ length: 10 }, (_, index) => saved[index] || null);
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
    title: result.title, mode: result.mode, url: tab.url
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

async function renderSlots() {
  const slots = await readSlots();
  snapshotsEl.replaceChildren();
  slots.forEach((slot, index) => {
    const row = document.createElement("div");
    row.className = "snapshot";
    const info = document.createElement("div");
    info.className = "snapshot-info";
    const label = document.createElement("strong");
    label.textContent = `スロット ${index + 1}`;
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
    row.append(info, save);
    if (slot) {
      const load = document.createElement("button");
      load.className = slot.mode === "edit" ? "load-edit" : "load-play";
      load.textContent = slot.mode === "edit" ? "ロードして編集" : "ロードして解く";
      load.onclick = () => loadSlot(slot);
      row.append(load);
    }
    snapshotsEl.append(row);
  });
}

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  renderSlots();
})();
