const statusEl = document.querySelector("#status");
const snapshotsEl = document.querySelector("#snapshots");
const slotsKey = "puzzle-saver:slots";
const slotsPerPage = 25;
const slotCount = 50;
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const badgeOptions = [
  ["none", "バッジなし"],
  ["in-progress", "途中"],
  ["favorite", "お気に入り"],
  ["complete", "完成"]
];
let tab;
let currentPage = 0;

function setStatus(message) { statusEl.textContent = message; }

function formatSavedAt(savedAt) {
  return new Date(savedAt).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

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
  const previous = slots[index];
  slots[index] = {
    savedAt: Date.now(), data: result.data, puzzleId: result.puzzleId,
    title: result.title, mode: result.mode, url: tab.url,
    puzzLinkUrl: result.puzzLinkUrl,
    badge: previous?.badge || "none"
  };
  await chrome.storage.local.set({ [slotsKey]: slots });
  setStatus(`スロット ${index + 1} に保存しました。`);
  renderSlots();
}

async function setBadge(index, badge) {
  const slots = await readSlots();
  if (!slots[index]) return;
  slots[index].badge = badge;
  await chrome.storage.local.set({ [slotsKey]: slots });
  setStatus("バッジを変更しました。");
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
    row.className = slot ? "snapshot" : "snapshot snapshot-empty";
    const info = document.createElement("div");
    info.className = "snapshot-info";
    const heading = document.createElement("div");
    heading.className = "snapshot-heading";
    const label = document.createElement("strong");
    label.textContent = `# ${index + 1}`;
    heading.append(label);
    if (slot) {
      const badgeValue = badgeOptions.some(([value]) => value === slot.badge) ? slot.badge : "none";
      const badge = document.createElement("div");
      badge.className = "badge-control";
      const badgeIcon = document.createElement("img");
      badgeIcon.src = `icons/badges/${badgeValue}.svg`;
      badgeIcon.alt = "";
      const badgeSelect = document.createElement("select");
      badgeSelect.setAttribute("aria-label", `スロット ${index + 1} のバッジ`);
      badgeSelect.title = "バッジを変更";
      for (const [value, text] of badgeOptions) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        badgeSelect.append(option);
      }
      badgeSelect.value = badgeValue;
      badgeSelect.onchange = () => setBadge(index, badgeSelect.value);
      badge.append(badgeIcon, badgeSelect);
      heading.append(badge);
    }
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
      info.append(heading, time, details, url);
    } else {
      details.textContent = "空きスロット";
      info.append(heading, details);
    }
    const save = document.createElement("button");
    save.className = "save";
    save.textContent = slot ? "上書き保存" : "保存";
    save.onclick = () => saveToSlot(index);
    row.append(info);
    row.append(save);
    if (slot) {
      const load = document.createElement("button");
      load.className = slot.mode === "edit" ? "load-edit" : "load-play";
      load.textContent = slot.mode === "edit" ? "ロードして編集" : "ロードして解く";
      load.onclick = () => loadSlot(slot);
      row.append(load);
      if (getPuzzLinkUrl(slot)) {
        const puzzLink = document.createElement("button");
        puzzLink.className = "load-puzzlink";
        puzzLink.textContent = "puzz.linkで解く";
        puzzLink.onclick = () => loadInPuzzLink(slot);
        row.append(puzzLink);
        row.classList.add("has-puzzlink");
      }
    }
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
