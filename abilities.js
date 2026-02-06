// ===== Config =====
const CSV_PATH = "resources/abilities-sheet.csv";

// ===== UI Elements =====
const abilitiesListEl = document.getElementById("abilitiesList");
const abilityPanelEl = document.getElementById("abilityPanel");

const filebarEl = document.getElementById("filebar");
const csvInputEl = document.getElementById("csvInput");
const fileNameEl = document.getElementById("fileName");

// ===== State =====
let ABILITIES = [];
let selectedIndex = -1;

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

// Expecting columns like: Ability, Description
function normalizeAbilityRow(row) {
  return {
    Ability: row.Ability ?? row.ability ?? row.Name ?? row.name ?? "",
    Description: row.Description ?? row.description ?? row.Effect ?? row.effect ?? ""
  };
}

// ===== Loaders =====
async function tryAutoLoadCSV() {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text).map(normalizeAbilityRow);
}

async function loadCSVFromFile(file) {
  const text = await file.text();
  return parseCSV(text).map(normalizeAbilityRow);
}

function showLoadCSVUI(message) {
  filebarEl.hidden = false;
  fileNameEl.textContent = message || "Select abilities.csv";
}

// ===== Renderers =====
function renderAbilitiesList(items) {
  abilitiesListEl.innerHTML = "";

  if (!items.length) {
    abilitiesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">NO ABILITIES</div>
          <div class="cell mini">CHECK CSV</div>
        </div>
      </li>
    `;
    return;
  }

  items.forEach((a, idx) => {
    const li = document.createElement("li");
    li.className = "move";
    li.tabIndex = 0;

    const name = String(a.Ability || "").trim();

    li.innerHTML = `
      <div class="row6">
        <div class="cell name">${escapeHtml(name)}</div>
        <div class="cell mini"></div>
      </div>
    `;

    li.addEventListener("click", () => selectAbility(idx));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectAbility(idx);
      }
    });

    abilitiesListEl.appendChild(li);
  });
}

function setSelectedVisual(idx) {
  const items = abilitiesListEl.querySelectorAll(".move");
  items.forEach(el => el.classList.remove("is-selected"));
  if (items[idx]) items[idx].classList.add("is-selected");
}

function renderAbility(a) {
  const name = String(a.Ability || "").trim();
  const desc = String(a.Description || "").trim();

  abilityPanelEl.innerHTML = `
    <div class="spell__scroll">
      <div class="spell__header">
        <div class="spell__title">${escapeHtml(name)}</div>
      </div>
      <div class="spell__desc">${escapeHtml(desc || "—")}</div>
    </div>
  `;
}

function selectAbility(idx, opts = { focus: true }) {
  selectedIndex = idx;
  setSelectedVisual(idx);

  const a = ABILITIES[idx];
  if (a) renderAbility(a);

  if (opts.focus) {
    abilitiesListEl.querySelectorAll(".move")[idx]?.focus();
  }
}

// ===== Local file input fallback wiring =====
csvInputEl.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  fileNameEl.textContent = file.name.toUpperCase();

  try {
    ABILITIES = await loadCSVFromFile(file);
    ABILITIES = ABILITIES.filter(a => String(a.Ability).trim().length > 0);

    renderAbilitiesList(ABILITIES);
    if (ABILITIES.length > 0) selectAbility(0, { focus: false });
  } catch (err) {
    console.error(err);
    abilitiesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">FAILED TO READ CSV</div>
          <div class="cell mini">CHECK FORMAT</div>
        </div>
      </li>
    `;
    abilityPanelEl.innerHTML = `<div class="spell__empty">Could not load abilities.</div>`;
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

// ===== Boot =====
(async function init() {
  try {
    ABILITIES = await tryAutoLoadCSV();
    ABILITIES = ABILITIES.filter(a => String(a.Ability).trim().length > 0);

    renderAbilitiesList(ABILITIES);
    if (ABILITIES.length > 0) selectAbility(0, { focus: false });
  } catch (err) {
    console.warn("Auto-load failed, falling back to file picker:", err);
    abilitiesListEl.innerHTML = `
      <li class="move" tabindex="0">
        <div class="row6">
          <div class="cell name">LOAD abilities.csv</div>
          <div class="cell mini">AUTO-LOAD FAILED</div>
        </div>
      </li>
    `;
    abilityPanelEl.innerHTML = `<div class="spell__empty">Could not auto-load abilities.</div>`;
    showLoadCSVUI("AUTO-LOAD FAILED — LOAD abilities.csv");
  }
})();