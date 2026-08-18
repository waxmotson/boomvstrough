const FIELD_INFO = [
  { key: "cpi", label: "CPI" },
  { key: "ocr", label: "OCR" },
  { key: "ocr_change", label: "OCR change" },
  { key: "wpi", label: "WPI" },
  { key: "unemployment", label: "Unemployment" },
  { key: "underemployment", label: "Underemployment" },
  { key: "participation", label: "Participation" },
  { key: "underutilisation", label: "Underutilisation" },
  { key: "fiscal_position", label: "Fiscal position ($B)" },
  { key: "fiscal_stance", label: "Fiscal stance" },
  { key: "gdp_change", label: "GDP change" }
];

const PERCENT_KEYS = new Set([
  "cpi", "ocr", "ocr_change", "wpi", "unemployment",
  "participation", "gdp_change"
]);

let rows = [];
let chart = null;

const $ = id => document.getElementById(id);

function cleanHeader(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "?" || text === "-" || text === "—") return null;

  const cleaned = text.replace(/,/g, "").replace(/%/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseDateLabel(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!match) return null;

  const monthNames = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const month = monthNames[match[1]];
  const year = Number(match[2]);
  if (month === undefined || !Number.isFinite(year)) return null;

  // Dataset uses two-digit years; interpret 00–79 as 2000–2079.
  return new Date(2000 + year, month, 1);
}

function formatValue(value, key) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";

  if (PERCENT_KEYS.has(key)) {
    return `${Number(value).toFixed(2)}%`;
  }

  if (key === "fiscal_position") {
    return Number(value).toFixed(1);
  }

  return Number(value).toFixed(1);
}

function sourceValue(row, headers, wanted) {
  if (wanted in row) return row[wanted];

  const key = wanted.toLowerCase().trim();
  const match = headers.find(h => h.toLowerCase().trim() === key);
  return match ? row[match] : null;
}

function normaliseRow(raw, headers) {
  // This handles the column names from the supplied spreadsheet while being
  // tolerant of harmless changes such as whitespace.
  const normalised = {};
  const lookup = {};

  headers.forEach(h => {
    lookup[cleanHeader(h)] = h;
  });

  const get = (...names) => {
    for (const name of names) {
      const direct = lookup[name];
      if (direct !== undefined) return raw[direct];

      const lower = name.toLowerCase();
      const found = headers.find(h => h.toLowerCase().trim() === lower);
      if (found !== undefined) return raw[found];
    }
    return "";
  };

  const date = String(get("Unnamed: 1", "Date", "date")).trim();

  return {
    event: String(get("Unnamed: 0", "Event", "event")).trim(),
    date,
    dateValue: parseDateLabel(date),

    cpi: toNumber(get("? CPI", "CPI", "cpi")),
    ocr: toNumber(get("OCR", "ocr")),
    ocr_change: toNumber(get("? OCR", "OCR change", "ocr_change")),
    monetary_policy: String(get("MP", "Monetary policy", "monetary_policy")).trim(),

    wpi: toNumber(get("? WPI", "WPI", "wpi")),
    unemployment: toNumber(get("UNEMP", "Unemployment", "unemployment")),
    underemployment: toNumber(get("UNDEREMP", "Underemployment", "underemployment")),
    participation: toNumber(get("PARTIC", "Participation", "participation")),
    underutilisation: toNumber(get("UNDERUTILISE", "Underutilisation", "underutilisation")),

    fiscal_position: toNumber(get("FP ($B)", "Fiscal position", "fiscal_position")),
    fiscal_stance: String(get("FP STANCE", "Fiscal stance", "fiscal_stance")).trim(),
    gdp_change: toNumber(get("?GDP(1/4)", "GDP change", "gdp_change"))
  };
}

function populateControls() {
  $("metric").innerHTML = FIELD_INFO
    .filter(x => x.key !== "fiscal_stance")
    .map(x => `<option value="${x.key}">${x.label}</option>`)
    .join("");

  const dates = rows.map(r => r.date);
  const options = dates
    .map((d, i) => `<option value="${i}">${escapeHtml(d)}</option>`)
    .join("");

  $("fromDate").innerHTML = options;
  $("toDate").innerHTML = options;

  $("fromDate").value = "0";
  $("toDate").value = String(Math.max(rows.length - 1, 0));
  $("metric").value = "cpi";
}

function filteredRows() {
  let from = Number($("fromDate").value);
  let to = Number($("toDate").value);

  if (from > to) [from, to] = [to, from];
  return rows.slice(from, to + 1);
}

function updateStats(key, dataRows) {
  const values = dataRows
    .map(r => r[key])
    .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  $("rowCount").textContent = String(dataRows.length);

  if (!values.length) {
    $("latestValue").textContent = "—";
    $("latestDate").textContent = "No values in range";
    $("minValue").textContent = "—";
    $("maxValue").textContent = "—";
    return;
  }

  const latest = [...dataRows].reverse().find(r => r[key] !== null && r[key] !== undefined);

  $("latestValue").textContent = formatValue(latest[key], key);
  $("latestDate").textContent = latest.date || "—";
  $("minValue").textContent = formatValue(Math.min(...values), key);
  $("maxValue").textContent = formatValue(Math.max(...values), key);
}

function updateChart() {
  const key = $("metric").value;
  const info = FIELD_INFO.find(x => x.key === key);
  const dataRows = filteredRows();

  const labels = dataRows.map(r => r.date);
  const values = dataRows.map(r => r[key]);

  if (chart) chart.destroy();

  chart = new Chart($("mainChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: info.label,
        data: values,
        spanGaps: true,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => `${info.label}: ${formatValue(context.parsed.y, key)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 12
          }
        },
        y: {
          beginAtZero: false,
          ticks: {
            callback: value =>
              key === "fiscal_position" ? value : `${value}%`
          }
        }
      }
    }
  });

  $("chartTitle").textContent = info.label;
  $("rangeLabel").textContent =
    `${dataRows[0]?.date || "—"} → ${dataRows[dataRows.length - 1]?.date || "—"}`;

  updateStats(key, dataRows);
}

function renderTable() {
  const query = $("search").value.trim().toLowerCase();

  const filtered = rows.filter(row => {
    if (!query) return true;
    return Object.entries(row).some(([key, value]) => {
      if (key === "dateValue") return false;
      return value !== null &&
        value !== undefined &&
        String(value).toLowerCase().includes(query);
    });
  });

  $("dataBody").innerHTML = filtered.map(r => `
    <tr>
      <td>${escapeHtml(r.event || "—")}</td>
      <td>${escapeHtml(r.date || "—")}</td>
      <td>${formatValue(r.cpi, "cpi")}</td>
      <td>${formatValue(r.ocr, "ocr")}</td>
      <td>${formatValue(r.ocr_change, "ocr_change")}</td>
      <td class="tag">${escapeHtml(r.monetary_policy || "—")}</td>
      <td>${formatValue(r.wpi, "wpi")}</td>
      <td>${formatValue(r.unemployment, "unemployment")}</td>
      <td>${formatValue(r.underemployment, "underemployment")}</td>
      <td>${formatValue(r.participation, "participation")}</td>
      <td>${formatValue(r.underutilisation, "underutilisation")}</td>
      <td>${formatValue(r.fiscal_position, "fiscal_position")}</td>
      <td class="tag">${escapeHtml(r.fiscal_stance || "—")}</td>
      <td>${formatValue(r.gdp_change, "gdp_change")}</td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadCsv() {
  const response = await fetch(`data.csv?v=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Could not load data.csv (${response.status})`);
  }

  const csvText = await response.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parsed.errors?.length) {
    console.warn("CSV parsing warnings:", parsed.errors);
  }

  rows = parsed.data
    .map(row => normaliseRow(row, parsed.meta.fields || []))
    .filter(row => row.date)
    .sort((a, b) => {
      if (a.dateValue && b.dateValue) return a.dateValue - b.dateValue;
      return String(a.date).localeCompare(String(b.date));
    });

  if (!rows.length) {
    throw new Error("The CSV was loaded but contained no dated rows.");
  }
}

async function init() {
  try {
    await loadCsv();
    populateControls();
    updateChart();
    renderTable();

    $("status").textContent = `${rows.length} observations loaded`;
    $("datasetInfo").textContent =
      `${rows.length} rows · ${rows[0].date} → ${rows[rows.length - 1].date}`;

    $("metric").addEventListener("change", updateChart);
    $("fromDate").addEventListener("change", updateChart);
    $("toDate").addEventListener("change", updateChart);
    $("search").addEventListener("input", renderTable);

    $("resetBtn").addEventListener("click", () => {
      $("metric").value = "cpi";
      $("fromDate").value = "0";
      $("toDate").value = String(rows.length - 1);
      $("search").value = "";
      updateChart();
      renderTable();
    });
  } catch (error) {
    console.error(error);
    $("status").textContent = "Unable to load dataset";
    document.querySelector("main").insertAdjacentHTML(
      "afterbegin",
      `<div class="error"><strong>Dataset error:</strong> ${escapeHtml(error.message)}</div>`
    );
  }
}

init();
