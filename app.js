// ============================================================
//  BOOM VS TROUGH — dashboard logic
//  New: multi-series chart selection + point-in-time comparison
// ============================================================

const FIELD_INFO = [
  { key: "cpi",               label: "CPI change",       source: "CPI Change",    percent: true,  color: "#4fc3f7" },
  { key: "ocr",               label: "OCR",              source: "OCR",           percent: true,  color: "#ffb74d" },
  { key: "ocr_change",        label: "OCR change",       source: "OCR Change",    percent: true,  color: "#ba68c8" },
  { key: "wpi",               label: "WPI change",       source: "WPI Change",    percent: true,  color: "#81c784" },
  { key: "unemployment",      label: "Unemployment",     source: "UNEMP",         percent: true,  color: "#e57373" },
  { key: "underemployment",   label: "Underemployment",  source: "UNDEREMP",      percent: true,  color: "#f06292" },
  { key: "participation",     label: "Participation",    source: "PARTIC",        percent: true,  color: "#aed581" },
  { key: "underutilisation",  label: "Underutilisation", source: "UNDERUTILISE",  percent: true,  color: "#ffd54f" },
  { key: "fiscal_position",   label: "Fiscal position",  source: "FP ($B)",       percent: false, color: "#4db6ac" },
  { key: "gdp_change",        label: "GDP change",       source: "?GDP(1/4)",     percent: true,  color: "#ff8a65" }
];

const DEFAULT_SERIES = ["cpi", "ocr"];

let rows = [];
let chart = null;            // main time-series chart
let compareChart = null;     // snapshot bar chart
let activeLineFields = [];   // FIELD_INFO per dataset index of the line chart
let compareFields = [];      // FIELD_INFO per bar index of the comparison chart
let selectedSeries = new Set(DEFAULT_SERIES);

const $ = id => document.getElementById(id);

// ---------- helpers ----------

function toNumber(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text || text === "?" || text === "-" || text === "—" || text.toLowerCase() === "n/a") {
    return null;
  }

  const number = Number(text.replace(/,/g, "").replace(/%/g, "").replace(/\$/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseMonth(value) {
  const text = String(value ?? "").trim();

  // Handles the existing dataset format, e.g. Sep-19.
  const match = text.match(/^([A-Za-z]{3})-(\d{2})$/);

  if (!match) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3,
    May: 4, Jun: 5, Jul: 6, Aug: 7,
    Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const month = months[match[1]];
  if (month === undefined) return null;

  return new Date(2000 + Number(match[2]), month, 1);
}

function clean(value) {
  return String(value ?? "").trim();
}

function formatValue(value, field) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }

  const number = Number(value);

  if (field.percent) return `${number.toFixed(2)}%`;
  return number.toFixed(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSelectedFields() {
  return FIELD_INFO.filter(field => selectedSeries.has(field.key));
}

// ---------- data loading ----------

function normaliseRow(raw) {
  return {
    timePeriod: clean(raw["Time period"]),
    month: clean(raw["Month"]),
    monthValue: parseMonth(raw["Month"]),

    cpi: toNumber(raw["CPI Change"]),
    ocr: toNumber(raw["OCR"]),
    ocr_change: toNumber(raw["OCR Change"]),
    monetary_policy: clean(raw["MP"]),

    wpi: toNumber(raw["WPI Change"]),
    unemployment: toNumber(raw["UNEMP"]),
    underemployment: toNumber(raw["UNDEREMP"]),
    participation: toNumber(raw["PARTIC"]),
    underutilisation: toNumber(raw["UNDERUTILISE"]),

    fiscal_position: toNumber(raw["FP ($B)"]),
    fiscal_stance: clean(raw["FP STANCE"]),
    gdp_change: toNumber(raw["?GDP(1/4)"])
  };
}

async function loadCsv() {
  // Cache-buster so an updated CSV shows up immediately on GitHub Pages.
  const response = await fetch(`data.csv?v=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load data.csv (${response.status})`);
  }

  const csvText = await response.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV parsing warnings:", parsed.errors);
  }

  const required = [
    "Time period", "Month", "CPI Change", "OCR", "OCR Change", "MP",
    "WPI Change", "UNEMP", "UNDEREMP", "PARTIC", "UNDERUTILISE",
    "FP ($B)", "FP STANCE", "?GDP(1/4)"
  ];

  const headers = parsed.meta.fields || [];
  const missing = required.filter(column => !headers.includes(column));

  if (missing.length) {
    throw new Error(`Missing CSV columns: ${missing.join(", ")}`);
  }

  rows = parsed.data
    .map(normaliseRow)
    .filter(row => row.month)
    .sort((a, b) => {
      if (a.monthValue && b.monthValue) return a.monthValue - b.monthValue;
      return row.month.localeCompare(b.month);
    });

  if (!rows.length) {
    throw new Error("The CSV contains no usable rows.");
  }
}

// ---------- controls ----------

function populateControls() {
  // Series chips (replaces the old single-select #metric)
  $("metricChips").innerHTML = FIELD_INFO.map(field => `
    <label class="chip${selectedSeries.has(field.key) ? " checked" : ""}">
      <input type="checkbox" value="${field.key}"${selectedSeries.has(field.key) ? " checked" : ""}>
      <span class="chip-dot" style="background:${field.color}"></span>
      ${escapeHtml(field.label)}
    </label>
  `).join("");

  const monthOptions = rows.map((row, index) =>
    `<option value="${index}">${escapeHtml(row.month)}</option>`
  ).join("");

  $("fromDate").innerHTML = monthOptions;
  $("toDate").innerHTML = monthOptions;
  $("compareDate").innerHTML = monthOptions;

  $("fromDate").value = "0";
  $("toDate").value = String(rows.length - 1);
  $("compareDate").value = String(defaultCompareIndex());
}

// Latest month that actually has data for any ticked series
// (skips the trailing empty filler rows at the end of the CSV).
function defaultCompareIndex() {
  const fields = getSelectedFields();

  for (let i = rows.length - 1; i >= 0; i--) {
    if (fields.some(field => rows[i][field.key] !== null)) return i;
  }

  return Math.max(rows.length - 1, 0);
}

function filteredRows() {
  let from = Number($("fromDate").value);
  let to = Number($("toDate").value);

  if (from > to) [from, to] = [to, from];

  return rows.slice(from, to + 1);
}

// ---------- statistics (one card per selected series) ----------

function updateStats(fields, dataRows) {
  const grid = $("statsGrid");

  if (!fields.length) {
    grid.innerHTML = `
      <div class="stat">
        <span class="stat-label">Statistics</span>
        <strong>—</strong>
        <small>Tick one or more series above</small>
      </div>`;
    return;
  }

  grid.innerHTML = fields.map(field => {
    const validRows = dataRows.filter(
      row => row[field.key] !== null && Number.isFinite(Number(row[field.key]))
    );

    if (!validRows.length) {
      return `
        <div class="stat">
          <span class="stat-label"><span class="dot" style="background:${field.color}"></span>${escapeHtml(field.label)}</span>
          <strong>—</strong>
          <small>No data in range</small>
        </div>`;
    }

    const latest = validRows[validRows.length - 1];

    const minRow = validRows.reduce((min, row) =>
      Number(row[field.key]) < Number(min[field.key]) ? row : min
    );

    const maxRow = validRows.reduce((max, row) =>
      Number(row[field.key]) > Number(max[field.key]) ? row : max
    );

    return `
      <div class="stat">
        <span class="stat-label"><span class="dot" style="background:${field.color}"></span>${escapeHtml(field.label)}</span>
        <strong>${formatValue(latest[field.key], field)}</strong>
        <small>${escapeHtml(latest.month || "—")}</small>
        <div class="stat-sub">
          Min ${formatValue(minRow[field.key], field)} (${escapeHtml(minRow.month)})
          · Max ${formatValue(maxRow[field.key], field)} (${escapeHtml(maxRow.month)})
        </div>
      </div>`;
  }).join("");
}

// ---------- period shading plugin (unchanged behaviour, dark-theme colours) ----------

const periodBackgroundPlugin = {
  id: "periodBackground",

  beforeDraw(chart) {
    const { ctx, chartArea, scales } = chart;

    if (!chartArea || !scales.x) return;

    const displayedRows = chart.data.periodRows;
    if (!displayedRows || !displayedRows.length) return;

    const groups = [];
    let start = 0;

    for (let i = 1; i <= displayedRows.length; i++) {
      const current = displayedRows[i]?.timePeriod || "";
      const previous = displayedRows[i - 1]?.timePeriod || "";

      if (i === displayedRows.length || current !== previous) {
        if (previous) groups.push({ label: previous, start, end: i - 1 });
        start = i;
      }
    }

    ctx.save();

    groups.forEach((group, index) => {
      let left = scales.x.getPixelForValue(group.start);
      let right = scales.x.getPixelForValue(group.end);

      if (group.start > 0) {
        left = (scales.x.getPixelForValue(group.start - 1) + left) / 2;
      }

      if (group.end < displayedRows.length - 1) {
        right = (right + scales.x.getPixelForValue(group.end + 1)) / 2;
      }

      ctx.fillStyle =
        index % 2 === 0
          ? "rgba(255, 255, 255, 0.045)"
          : "rgba(255, 255, 255, 0.015)";

      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);

      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(group.label, (left + right) / 2, chartArea.top + 8);
    });

    ctx.restore();
  }
};

// ---------- main multi-series time-series chart ----------

function updateChart() {
  const fields = getSelectedFields();
  const dataRows = filteredRows();

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const first = dataRows[0]?.month || "—";
  const last = dataRows[dataRows.length - 1]?.month || "—";
  $("rangeLabel").textContent = `${first} → ${last}`;

  updateStats(fields, dataRows);

  if (!fields.length) {
    $("chartTitle").textContent = "No series selected";
    return;
  }

  $("chartTitle").textContent =
    fields.length === 1 ? fields[0].label : `${fields.length} series`;

  activeLineFields = fields;
  const allPercent = fields.every(field => field.percent);

  chart = new Chart($("mainChart").getContext("2d"), {
    plugins: [periodBackgroundPlugin],

    type: "line",
    data: {
      labels: dataRows.map(row => row.month),
      periodRows: dataRows,

      datasets: fields.map(field => ({
        label: field.label,
        data: dataRows.map(row => row[field.key]),
        borderColor: field.color,
        pointBackgroundColor: field.color,
        pointBorderColor: field.color,
        spanGaps: true,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#dddddd", boxWidth: 24, boxHeight: 3 }
        },
        tooltip: {
          callbacks: {
            label: context =>
              `${context.dataset.label}: ${formatValue(context.parsed.y, activeLineFields[context.datasetIndex])}`
          }
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 12, color: "#aaaaaa" },
          grid: { color: "rgba(255, 255, 255, 0.06)" }
        },
        y: {
          beginAtZero: false,
          ticks: {
            color: "#aaaaaa",
            callback: value => allPercent ? `${value}%` : value
          },
          grid: {
            color: context => context.tick.value === 0
              ? "#ebebeb"
              : "rgba(255, 255, 255, 0.08)",
            lineWidth: context => context.tick.value === 0 ? 2 : 1
          }
        }
      }
    }
  });
}

// ---------- point-in-time comparison (NEW) ----------

function renderComparison() {
  const fields = getSelectedFields();
  const index = Number($("compareDate").value);
  const row = rows[index];

  if (compareChart) {
    compareChart.destroy();
    compareChart = null;
  }

  $("compareMonthLabel").textContent = row ? row.month : "—";

  if (!row || !fields.length) {
    $("compareTiles").innerHTML =
      `<p class="cmp-empty">${!fields.length
        ? "Tick at least one series above to run a comparison."
        : "No data."}</p>`;
    $("compareMeta").textContent = "";
    return;
  }

  // Policy context for the chosen month
  const bits = [];
  if (row.monetary_policy && row.monetary_policy !== "N/A") {
    bits.push(`MP: ${escapeHtml(row.monetary_policy)}`);
  }
  if (row.fiscal_stance) {
    bits.push(`Fiscal stance: ${escapeHtml(row.fiscal_stance)}`);
  }
  $("compareMeta").innerHTML = bits.join(" &nbsp;·&nbsp; ");

  // Rank selected series at this month (highest first, missing data sinks)
  const entries = fields
    .map(field => ({ field, value: row[field.key] }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  const numeric = entries.filter(entry => entry.value !== null);

  let tiles = entries.map((entry, i) => {
    const best = numeric.length > 1 && entry === numeric[0];
    const worst = numeric.length > 1 && entry === numeric[numeric.length - 1];
    const unit = entry.field.key === "fiscal_position"
      ? `<span class="cmp-unit">$B</span>`
      : "";

    return `
      <div class="cmp-tile${best ? " cmp-best" : ""}${worst ? " cmp-worst" : ""}">
        <span class="cmp-rank">#${i + 1}</span>
        <span class="cmp-name">
          <span class="dot" style="background:${entry.field.color}"></span>${escapeHtml(entry.field.label)}
        </span>
        <div class="cmp-value">${formatValue(entry.value, entry.field)}${unit}</div>
      </div>`;
  }).join("");

  // Spread only meaningful when all compared values share the same unit family
  const sameFamily = numeric.length > 1 &&
    numeric.every(entry => entry.field.percent === numeric[0].field.percent);

  if (sameFamily) {
    const spread = numeric[0].value - numeric[numeric.length - 1].value;
    tiles += `
      <div class="cmp-tile cmp-spread">
        <span class="cmp-name">Spread (max − min)</span>
        <div class="cmp-value">${formatValue(spread, numeric[0].field)}</div>
      </div>`;
  }

  $("compareTiles").innerHTML = tiles;

  if (!numeric.length) {
    $("compareTiles").innerHTML +=
      `<p class="cmp-empty">No numeric values for the selected series at ${escapeHtml(row.month)}.</p>`;
    return;
  }

  // Horizontal bar chart on a shared axis
  compareFields = numeric.map(entry => entry.field);
  const allPercent = compareFields.every(field => field.percent);

  compareChart = new Chart($("compareChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: numeric.map(entry => entry.field.label),
      datasets: [{
        data: numeric.map(entry => entry.value),
        backgroundColor: numeric.map(entry => entry.field.color),
        borderRadius: 3,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context =>
              `${formatValue(context.parsed.x, compareFields[context.dataIndex])}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#aaaaaa",
            callback: value => allPercent ? `${value}%` : value
          },
          grid: {
            color: context => context.tick.value === 0
              ? "#ebebeb"
              : "rgba(255, 255, 255, 0.08)",
            lineWidth: context => context.tick.value === 0 ? 2 : 1
          }
        },
        y: {
          ticks: { color: "#dddddd" },
          grid: { display: false }
        }
      }
    }
  });
}

// ---------- raw data table (unchanged behaviour) ----------

function renderTable() {
  const query = $("search").value.trim().toLowerCase();

  const filtered = rows.filter(row => {
    if (!query) return true;

    return [
      row.timePeriod, row.month, row.monetary_policy, row.fiscal_stance,
      row.cpi, row.ocr, row.ocr_change, row.wpi, row.unemployment,
      row.underemployment, row.participation, row.underutilisation,
      row.fiscal_position, row.gdp_change
    ].some(value =>
      value !== null &&
      value !== undefined &&
      String(value).toLowerCase().includes(query)
    );
  });

  $("dataBody").innerHTML = filtered.map(row => `
    <tr>
      <td class="period">${escapeHtml(row.timePeriod || "—")}</td>
      <td>${escapeHtml(row.month || "—")}</td>
      <td>${formatValue(row.cpi, FIELD_INFO[0])}</td>
      <td>${formatValue(row.ocr, FIELD_INFO[1])}</td>
      <td>${formatValue(row.ocr_change, FIELD_INFO[2])}</td>
      <td class="tag">${escapeHtml(row.monetary_policy || "—")}</td>
      <td>${formatValue(row.wpi, FIELD_INFO[3])}</td>
      <td>${formatValue(row.unemployment, FIELD_INFO[4])}</td>
      <td>${formatValue(row.underemployment, FIELD_INFO[5])}</td>
      <td>${formatValue(row.participation, FIELD_INFO[6])}</td>
      <td>${formatValue(row.underutilisation, FIELD_INFO[7])}</td>
      <td>${formatValue(row.fiscal_position, FIELD_INFO[8])}</td>
      <td class="tag">${escapeHtml(row.fiscal_stance || "—")}</td>
      <td>${formatValue(row.gdp_change, FIELD_INFO[9])}</td>
    </tr>
  `).join("");
}

// ---------- init ----------

async function init() {
  try {
    await loadCsv();

    populateControls();
    updateChart();
    renderComparison();
    renderTable();

    $("status").textContent = `${rows.length} observations loaded`;
    $("datasetInfo").textContent =
      `${rows.length} rows · ${rows[0].month} → ${rows[rows.length - 1].month}`;

    // Event wiring
    $("metricChips").addEventListener("change", event => {
      const box = event.target.closest("input[type='checkbox']");
      if (!box) return;

      if (box.checked) selectedSeries.add(box.value);
      else selectedSeries.delete(box.value);

      box.closest(".chip").classList.toggle("checked", box.checked);

      updateChart();
      renderComparison();
    });

    $("fromDate").addEventListener("change", updateChart);
    $("toDate").addEventListener("change", updateChart);
    $("compareDate").addEventListener("change", renderComparison);
    $("search").addEventListener("input", renderTable);

    $("resetBtn").addEventListener("click", () => {
      selectedSeries = new Set(DEFAULT_SERIES);
      $("search").value = "";

      populateControls();
      updateChart();
      renderComparison();
      renderTable();
    });
  } catch (error) {
    console.error(error);

    $("status").textContent = "Unable to load dataset";

    document.querySelector("main").insertAdjacentHTML(
      "afterbegin",
      `<p class="error">Dataset error: ${escapeHtml(error.message)}</p>`
    );
  }
}

init();