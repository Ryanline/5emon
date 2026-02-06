// ===== Config =====
const CSV_PATH = "resources/move-sheet.csv";
const SCROLL_SFX_PATH = "resources/audio/scroll-sound.wav";
const IMAGES_BASE = "resources/images";

// ===== UI Elements =====
const movesListEl = document.getElementById("movesList");
const spellPanelEl = document.getElementById("spellPanel");

const filebarEl = document.getElementById("filebar");
const csvInputEl = document.getElementById("csvInput");
const fileNameEl = document.getElementById("fileName");

const filterbarEl = document.getElementById("filterbar");

// ===== Audio (scroll tick) =====
const scrollAudio = new Audio(SCROLL_SFX_PATH);
scrollAudio.preload = "auto";
scrollAudio.volume = 0.6;

let audioUnlocked = false;
let lastHighlightedEl = null;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  scrollAudio.currentTime = 0;
  scrollAudio.play().then(() => {
    scrollAudio.pause();
    scrollAudio.currentTime = 0;
  }).catch(() => {
    audioUnlocked = false;
  });
}

function playScrollSound() {
  if (!audioUnlocked) return;
  scrollAudio.currentTime = 0;
  scrollAudio.play().catch(() => {});
}

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

// ===== Icons =====
function categoryIcon(categoryRaw) {
  const c = String(categoryRaw || "").trim().toLowerCase();
  if (c === "physical") return "physical.png";
  if (c === "special") return "special.png";
  return "status.png"; // Status (or anything else)
}

function typeIcon(typeRaw) {
  const t = String(typeRaw || "").trim().toLowerCase();
  return `${t}.png`;
}

// ===== State =====
let MOVES = [];
let FILTERED = [];
let selectedIndex = -1;
let currentFilter = "all"; // all | attack | cantrip | "1".."9"

// ===== CSV Parsing =====
// Handles commas, quotes, and newlines inside quoted fields.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const data = [];

  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rows[r][c] ?? "").trim();
    }
    data.push(obj);
  }
  return data;
}

function normalizeMoveRow(row) {
  // Matches your new headers (plus tolerant fallbacks)
  return {
    Attack: row.Attack ?? row.attack ?? "",
    Type: row.Type ?? row.type ?? "",
    Category: row.Category ?? row.category ?? "",
    Level: row.Level ?? row.level ?? "",
    "Casting Time": row["Casting Time"] ?? row.castingTime ?? "",
    "Mini description": row["Mini description"] ?? row["Mini Description"] ?? row.miniDescription ?? row.mini ?? "",
    Range: row.Range ?? row.range ?? "",
    Duration: row.Duration ?? row.duration ?? "",
    Description: row.Description ?? row.description ?? ""
  };
}

// ===== Helpers: Level labeling =====
function cleanLevel(move) {
  return String(move.Level || "").trim();
}

function isAttackMove(move) {
  const lvl = cleanLevel(move).toLowerCase();
  return lvl === "" || lvl === "-" || lvl === "attack";
}

function levelForList(move) {
  if (isAttackMove(move)) return "-";
  // Keep user's formatting like "Cantrip" or "Lv. 1"
  const lvl = cleanLevel(move);
  return lvl || "-";
}

function levelKeyForFilter(move) {
  // returns: attack | cantrip | "1".."9" | ""
  if (isAttackMove(move)) return "attack";

  const lvl = cleanLevel(move).toLowerCase();

  if (lvl === "cantrip") return "cantrip";

  // Accept: "lv. 1", "lv 1", "level 1", "1"
  const m = lvl.match(/([1-9])/);
  if (m) return m[1];

  return "";
}

// ===== Loaders =====
async function tryAutoLoadCSV() {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text).map(normalizeMoveRow);
}

async function loadCSVFromFile(file) {
  const text = await file.text();
  return parseCSV(text).map(normalizeMoveRow);
}

function showLoadCSVUI(message) {
  filebarEl.hidden = false;
  fileNameEl.textContent = message || "Select move-sheet.csv";
}

// ===== Filter bar scrolling improvement =====
function enableWheelToHorizontalScroll(el) {
  el.addEventListener("wheel", (e) => {
    // If shift is held, browsers often already scroll horizontally.
    // This makes normal wheel do horizontal scrolling when there's overflow.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
}

// ===== Filtering =====
function applyFilter() {
  const f = currentFilter;

  FILTERED = MOVES.filter((m) => {
    if (!String(m.Attack).trim()) return false;

    if (f === "all") return true;

    const key = levelKeyForFilter(m);

    if (f === "attack") return key === "attack";
    if (f === "cantrip") return key === "cantrip";
    if (/^[1-9]$/.test(f)) return key === f;

    return true;
  });

  renderMovesList(FILTERED);

  if (FILTERED.length > 0) {
    selectMove(0, { focus: false });
  } else {
    spellPanelEl.innerHTML = `<div class="spell__empty">NO MOVES MATCH THIS FILTER.</div>`;
  }
}

function setActiveFilterButton() {
  document.querySelectorAll(".filterbtn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.filter === currentFilter);
  });
}

function initFilters() {
  enableWheelToHorizontalScroll(filterbarEl);

  filterbarEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filterbtn");
    if (!btn) return;

    currentFilter = btn.dataset.filter;
    setActiveFilterButton();
    applyFilter();
  });
}

// ===== Renderers =====
function renderMovesList(moves) {
  movesListEl.innerHTML = "";

  if (!moves.length) {
    movesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">NO MOVES</div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell level">—</div>
          <div class="cell cast">—</div>
          <div class="cell mini">CHECK FILTER / CSV</div>
        </div>
      </li>
    `;
    return;
  }

  moves.forEach((m, idx) => {
    const li = document.createElement("li");
    li.className = "move";
    li.tabIndex = 0;

    const name = String(m.Attack || "").trim();
    const type = String(m.Type || "").trim();
    const category = String(m.Category || "").trim();
    const level = levelForList(m);
    const casting = String(m["Casting Time"] || "-").trim() || "-";
    const mini = String(m["Mini description"] || "-").trim() || "-";

    const typeImg = `${IMAGES_BASE}/types/${typeIcon(type)}`;
    const catImg = `${IMAGES_BASE}/categories/${categoryIcon(category)}`;

    li.innerHTML = `
      <div class="row6">
        <div class="cell name">${escapeHtml(name)}</div>
        <div class="cell icon">
          ${type ? `<img src="${typeImg}" alt="${escapeAttr(type)} type">` : `<span class="placeholder-icon"></span>`}
        </div>
        <div class="cell icon">
          ${category ? `<img src="${catImg}" alt="${escapeAttr(category)} category">` : `<span class="placeholder-icon"></span>`}
        </div>
        <div class="cell level">${escapeHtml(level)}</div>
        <div class="cell cast">${escapeHtml(casting)}</div>
        <div class="cell mini">${escapeHtml(mini)}</div>
      </div>
    `;

    // sound on highlight change
    li.addEventListener("mouseenter", () => {
      if (li === lastHighlightedEl) return;
      lastHighlightedEl = li;
      playScrollSound();
    });

    li.addEventListener("focus", () => {
      if (li === lastHighlightedEl) return;
      lastHighlightedEl = li;
      playScrollSound();
    });

    li.addEventListener("click", () => selectMove(idx));

    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectMove(idx);
      }
    });

    movesListEl.appendChild(li);
  });
}

function setSelectedVisual(idx) {
  const items = movesListEl.querySelectorAll(".move");
  items.forEach((el) => el.classList.remove("is-selected"));
  if (items[idx]) items[idx].classList.add("is-selected");
}

function renderSpell(move) {
  const name = move.Attack || "";
  const category = move.Category || "";
  const type = move.Type || "";

  const level = move.Level || "-";
  const casting = move["Casting Time"] || "-";
  const range = move.Range || "-";
  const duration = move.Duration || "-";
  const desc = move.Description || "";

  const typeImg = `${IMAGES_BASE}/types/${typeIcon(type)}`;
  const catImg = `${IMAGES_BASE}/categories/${categoryIcon(category)}`;

  spellPanelEl.innerHTML = `
    <div class="spell__scroll">
      <div class="spell__header">
        <div class="spell__title">${escapeHtml(name)}</div>
        <div class="spell__badges">
          <div class="badge" title="Type">
            <img src="${typeImg}" alt="${escapeAttr(type)} type">
            <div class="badge__label">TYPE</div>
          </div>
          <div class="badge" title="Category">
            <img src="${catImg}" alt="${escapeAttr(category)} category">
            <div class="badge__label">CAT.</div>
          </div>
        </div>
      </div>

      <div class="spell__meta">
        <div class="meta__row">
          <div class="meta__key">LEVEL:</div>
          <div class="meta__value">${escapeHtml(String(level || "-"))}</div>
        </div>
        <div class="meta__row">
          <div class="meta__key">CASTING TIME:</div>
          <div class="meta__value">${escapeHtml(String(casting || "-"))}</div>
        </div>
        <div class="meta__row">
          <div class="meta__key">RANGE:</div>
          <div class="meta__value">${escapeHtml(String(range || "-"))}</div>
        </div>
        <div class="meta__row">
          <div class="meta__key">DURATION:</div>
          <div class="meta__value">${escapeHtml(String(duration || "-"))}</div>
        </div>
      </div>

      <div class="spell__desc">${escapeHtml(String(desc || ""))}</div>
    </div>
  `;
}

function selectMove(idx, opts = { focus: true }) {
  selectedIndex = idx;
  setSelectedVisual(idx);

  const move = FILTERED[idx];
  if (move) renderSpell(move);

  if (opts.focus) {
    movesListEl.querySelectorAll(".move")[idx]?.focus();
  }
}

// ===== Local file input fallback wiring =====
csvInputEl.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  fileNameEl.textContent = file.name.toUpperCase();

  try {
    MOVES = await loadCSVFromFile(file);
    MOVES = MOVES.filter(m => String(m.Attack).trim().length > 0);
    initAfterMovesLoaded();
  } catch (err) {
    console.error(err);
    movesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">FAILED TO READ CSV</div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell level">—</div>
          <div class="cell cast">—</div>
          <div class="cell mini">CHECK FORMAT</div>
        </div>
      </li>
    `;
    spellPanelEl.innerHTML = `<div class="spell__empty">Could not load moves.</div>`;
  }
});

// ===== Helpers =====
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}

// ===== Init glue =====
function initAfterMovesLoaded() {
  // Bind filters once
  if (!filterbarEl.dataset.bound) {
    initFilters();
    filterbarEl.dataset.bound = "true";
  }

  setActiveFilterButton();
  applyFilter();

  if (FILTERED.length > 0) {
    selectMove(0, { focus: false });
    movesListEl.querySelector(".move")?.focus();
  }
}

// ===== Boot =====
(async function init() {
  try {
    // Init filters early so the wheel scroll works even before data arrives
    if (!filterbarEl.dataset.bound) {
      initFilters();
      filterbarEl.dataset.bound = "true";
    }

    MOVES = await tryAutoLoadCSV();
    MOVES = MOVES.filter(m => String(m.Attack).trim().length > 0);

    initAfterMovesLoaded();
  } catch (err) {
    console.warn("Auto-load failed, falling back to file picker:", err);

    movesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">LOAD move-sheet.csv</div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell icon"><span class="placeholder-icon"></span></div>
          <div class="cell level">—</div>
          <div class="cell cast">—</div>
          <div class="cell mini">AUTO-LOAD FAILED</div>
        </div>
      </li>
    `;
    spellPanelEl.innerHTML = `<div class="spell__empty">Could not auto-load moves.</div>`;
    showLoadCSVUI("AUTO-LOAD FAILED — LOAD move-sheet.csv");
  }
})();