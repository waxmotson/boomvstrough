const FIELD_INFO = [
  { key: "cpi", label: "CPI change", source: "CPI Change", percent: true },
  { key: "ocr", label: "OCR", source: "OCR", percent: true },
  { key: "ocr_change", label: "OCR change", source: "OCR Change", percent: true },
  { key: "wpi", label: "WPI change", source: "WPI Change", percent: true },
  { key: "unemployment", label: "Unemployment", source: "UNEMP", percent: true },
  { key: "underemployment", label: "Underemployment", source: "UNDEREMP", percent: true },
  { key: "participation", label: "Participation", source: "PARTIC", percent: true },
  { key: "underutilisation", label: "Underutilisation", source: "UNDERUTILISE", percent: true },
  { key: "fiscal_position", label: "Fiscal position ($B)", source: "FP ($B)", percent: false },
  { key: "gdp_change", label: "GDP change", source: "?GDP(1/4)", percent: true }
];

let rows = [];
let chart = null;

const $ = id => document.getElementById(id);

function toNumber(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text || text === "?" || text === "-" || text === "—") return null;

  const number = Number(
    text
      .replace(/,/g, "")
      .replace(/%/g, "")
      .replace(/\$/g, "")
  );

  return Number.isFinite(number) ? number : null;
}

function parseMonth(value) {
  const text = String(value ?? "").trim();

  // Handles the existing dataset format, e.g. Sep-19.
  const match = text.match(/^([A-Za-z]{3})-(\d{2})$/);

  if (!match) {
    // Also allow normal browser-readable dates if the CSV is changed later.
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
  if (field.key === "fiscal_position") return number.toFixed(1);

  return number.toFixed(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function populateControls() {
  $("metric").innerHTML = FIELD_INFO
    .map(field => `<option value="${field.key}">${escapeHtml(field.label)}</option>`)
    .join("");

  const options = rows.map((row, index) =>
    `<option value="${index}">${escapeHtml(row.month)}</option>`
  ).join("");

  $("fromDate").innerHTML = options;
  $("toDate").innerHTML = options;

  $("fromDate").value = "0";
  $("toDate").value = String(rows.length - 1);
  $("metric").value = "cpi";
}

function filteredRows() {
  let from = Number($("fromDate").value);
  let to = Number($("toDate").value);

  if (from > to) [from, to] = [to, from];

  return rows.slice(from, to + 1);
}

function updateStats(field, dataRows) {
  const validRows = dataRows.filter(
    row => row[field.key] !== null &&
           row[field.key] !== undefined &&
           Number.isFinite(Number(row[field.key]))
  );

  // $("rowCount").textContent = String(dataRows.length);

  if (!validRows.length) {
    $("latestValue").textContent = "—";
    $("latestDate").textContent = "No data";

    $("minValue").textContent = "—";
    $("minDate").textContent = "—";

    $("maxValue").textContent = "—";
    $("maxDate").textContent = "—";

    return;
  }

  const latest = validRows[validRows.length - 1];

  const minRow = validRows.reduce((min, row) =>
    Number(row[field.key]) < Number(min[field.key]) ? row : min
  );

  const maxRow = validRows.reduce((max, row) =>
    Number(row[field.key]) > Number(max[field.key]) ? row : max
  );

  $("latestValue").textContent =
    formatValue(latest[field.key], field);

  $("latestDate").textContent =
    latest.month || "—";

  $("minValue").textContent =
    formatValue(minRow[field.key], field);

  $("minDate").textContent =
    minRow.month || "—";

  $("maxValue").textContent =
    formatValue(maxRow[field.key], field);

  $("maxDate").textContent =
    maxRow.month || "—";
}



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
        if (previous) {
          groups.push({
            label: previous,
            start,
            end: i - 1
          });
        }

        start = i;
      }
    }

    ctx.save();

    groups.forEach((group, index) => {
      let left = scales.x.getPixelForValue(group.start);
      let right = scales.x.getPixelForValue(group.end);

      if (group.start > 0) {
        const previousX =
          scales.x.getPixelForValue(group.start - 1);
        left = (previousX + left) / 2;
      }

      if (group.end < displayedRows.length - 1) {
        const nextX =
          scales.x.getPixelForValue(group.end + 1);
        right = (right + nextX) / 2;
      }

      ctx.fillStyle =
        index % 2 === 0
          ? "rgba(21, 23, 28, 0.045)"
          : "rgba(21, 23, 28, 0.015)";

      ctx.fillRect(
        left,
        chartArea.top,
        right - left,
        chartArea.bottom - chartArea.top
      );

      ctx.fillStyle = "rgba(21, 23, 28, 0.55)";
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      ctx.fillText(
        group.label,
        (left + right) / 2,
        chartArea.top + 8
      );
    });

    ctx.restore();
  }
};



function updateChart() {
  const field = FIELD_INFO.find(item => item.key === $("metric").value);
  const dataRows = filteredRows();

  if (chart) {
    chart.destroy();
    chart = null;
  }

  chart = new Chart($("mainChart").getContext("2d"), {
    plugins: [periodBackgroundPlugin],
    
    type: "line",
    data: {
      labels: dataRows.map(row => row.month),
      periodRows: dataRows,

      datasets: [{
        label: field.label,
        data: dataRows.map(row => row[field.key]),
        spanGaps: true,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0
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
            label: context =>
              `${field.label}: ${formatValue(context.parsed.y, field)}`
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
            callback: value => field.percent ? `${value}%` : value
          },
          grid: {
            color: context => context.tick.value === 0
              ? "#d9dedb"
              : "#1d3c1d",
            lineWidth: context => context.tick.value === 0
              ? 2
              : 1
          }
        }
      }
    }
  });

  $("chartTitle").textContent = field.label;

  const first = dataRows[0]?.month || "—";
  const last = dataRows[dataRows.length - 1]?.month || "—";
  $("rangeLabel").textContent = `${first} → ${last}`;

  updateStats(field, dataRows);
}

function renderTable() {
  const query = $("search").value.trim().toLowerCase();

  const filtered = rows.filter(row => {
    if (!query) return true;

    return [
      row.timePeriod,
      row.month,
      row.monetary_policy,
      row.fiscal_stance,
      row.cpi,
      row.ocr,
      row.ocr_change,
      row.wpi,
      row.unemployment,
      row.underemployment,
      row.participation,
      row.underutilisation,
      row.fiscal_position,
      row.gdp_change
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

async function loadCsv() {
  // The timestamp prevents GitHub Pages/browser caching from making an
  // updated CSV appear to be the old version.
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

  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV parsing warnings:", parsed.errors);
  }

  const required = [
    "Time period",
    "Month",
    "CPI Change",
    "OCR",
    "OCR Change",
    "MP",
    "WPI Change",
    "UNEMP",
    "UNDEREMP",
    "PARTIC",
    "UNDERUTILISE",
    "FP ($B)",
    "FP STANCE",
    "?GDP(1/4)"
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
      if (a.monthValue && b.monthValue) {
        return a.monthValue - b.monthValue;
      }

      return row.month.localeCompare(b.month);
    });

  if (!rows.length) {
    throw new Error("The CSV contains no usable rows.");
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
      `${rows.length} rows · ${rows[0].month} → ${rows[rows.length - 1].month}`;

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
      `<div class="error">
        <strong>Dataset error:</strong> ${escapeHtml(error.message)}
      </div>`
    );
  }
}

init();
