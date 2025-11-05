// 設定：ここをいじるだけで別データに差し替えられる
const DATA_URL = "./data/data.csv"; // JSONなら "./data/data.json" にして fetch 後の処理を変更

let rawRows = [];
let filtered = [];
let chart; // Chart.js インスタンス

async function loadCSV(url) {
  const text = await fetch(url).then(r => r.text());
  const { data } = Papa.parse(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
  return data; // [{col1:..., col2:...}, ...]
}

// テーブルを描画
function renderTable(rows) {
  const table = document.getElementById("table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = ""; tbody.innerHTML = "";
  if (!rows.length) return;

  const cols = Object.keys(rows[0]);
  const trh = document.createElement("tr");
  cols.forEach(c => {
    const th = document.createElement("th"); th.textContent = c; trh.appendChild(th);
  });
  thead.appendChild(trh);

  rows.slice(0, 200).forEach(r => {
    const tr = document.createElement("tr");
    cols.forEach(c => {
      const td = document.createElement("td");
      td.textContent = r[c];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ドロップダウン初期化
function initSelectors(rows) {
  const cols = Object.keys(rows[0] || {});
  const ySelect = document.getElementById("ySelect");
  const xSelect = document.getElementById("xSelect");
  ySelect.innerHTML = ""; xSelect.innerHTML = "";

  // 数値列を Y 候補、文字列列を X 候補に雑に分ける
  const numericCols = cols.filter(k => typeof rows.find(r => r[k] !== null && r[k] !== "" && r[k] !== undefined)?.[k] === "number");
  const stringCols  = cols.filter(k => !numericCols.includes(k));

  (numericCols.length ? numericCols : cols).forEach(c => {
    const opt = document.createElement("option"); opt.value = c; opt.textContent = c; ySelect.appendChild(opt);
  });
  (stringCols.length ? stringCols : cols).forEach(c => {
    const opt = document.createElement("option"); opt.value = c; opt.textContent = c; xSelect.appendChild(opt);
  });
}

// 集計して棒グラフ
function renderChart(rows, xKey, yKey) {
  const ctx = document.getElementById("chart");
  // xKey毎の合計（雑にSum）
  const map = new Map();
  rows.forEach(r => {
    const x = String(r[xKey] ?? "");
    const y = Number(r[yKey] ?? 0);
    if (!isFinite(y)) return;
    map.set(x, (map.get(x) || 0) + y);
  });
  const labels = [...map.keys()].slice(0, 40);
  const values = labels.map(l => map.get(l));

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: `${yKey} by ${xKey}`, data: values }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// フィルタ
function applyFilter(q) {
  if (!q) return rawRows;
  const low = q.toLowerCase();
  return rawRows.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(low)));
}

// CSV ダウンロード（現在の表示）
function downloadCSV(rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "filtered.csv";
  a.click();
}

async function main() {
  rawRows = await loadCSV(DATA_URL);
  filtered = rawRows;
  document.getElementById("meta").textContent = `rows: ${rawRows.length}  cols: ${Object.keys(rawRows[0]||{}).length}`;
  initSelectors(rawRows);
  renderTable(filtered);

  const ySelect = document.getElementById("ySelect");
  const xSelect = document.getElementById("xSelect");
  renderChart(filtered, xSelect.value, ySelect.value);

  document.getElementById("filterInput").addEventListener("input", (e) => {
    filtered = applyFilter(e.target.value);
    renderTable(filtered);
    renderChart(filtered, xSelect.value, ySelect.value);
  });

  ySelect.addEventListener("change", () => renderChart(filtered, xSelect.value, ySelect.value));
  xSelect.addEventListener("change", () => renderChart(filtered, xSelect.value, ySelect.value));

  document.getElementById("downloadBtn").addEventListener("click", () => downloadCSV(filtered));
}

main().catch(console.error);
