import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const MONTHS = ["May 2026","Jun 2026","Jul 2026","Ago 2026","Sep 2026","Oct 2026","Nov 2026","Dic 2026","Ene 2027","Feb 2027","Mar 2027"];
const SHORT = MONTHS.map(m => m.split(" ")[0]);
const N = MONTHS.length;
const STORAGE_KEY = "cashflow-santa-rosa";

const fmt = (n) => {
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("es-AR");
};

const fmtChart = (n) => {
  if (n === 0) return "$0";
  const abs = Math.abs(n); const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(0) + "k";
  return sign + "$" + abs.toFixed(0);
};

const numParse = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$.%\s]/g, "").replace(/,/g, ".");
  return parseFloat(s) || 0;
};

function loadSaved() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}

// ---- Theme definitions ----
const themes = {
  dark: {
    bg: "#050505", bg2: "#0d0d0d", bg3: "#111111", bgHeader: "linear-gradient(135deg, #0d0d0d 0%, #1a1205 100%)",
    text: "#e0e0e0", textSoft: "#999", textMuted: "#555", border: "#2a2a2a", borderHeader: "#2a2207",
    inputBg: "#0a0a0a", inputBorder: "#333",
    accent: "#f0b429", green: "#2ecc71", red: "#e74c3c", blue: "#3498db", orange: "#e67e22",
    chartLine: "#f0b429", chartGreen: "#2ecc71", chartRed: "#e74c3c",
    kpiBg: "#0d0d0d", kpiBorder: "#1a1a1a",
    tabActive: "#f0b429", tabInactive: "#666",
    stickyBg: "#050505", summaryBg: "#0d0d08", ingresosBg: "#0a0f0a",
    negZone: "rgba(231,76,60,0.08)", uploadBg: "#080808", uploadBorder: "#333",
  },
  light: {
    bg: "#f5f5f0", bg2: "#ffffff", bg3: "#eaeaea", bgHeader: "linear-gradient(135deg, #ffffff 0%, #fdf6e3 100%)",
    text: "#1a1a1a", textSoft: "#555", textMuted: "#999", border: "#d0d0d0", borderHeader: "#d4a017",
    inputBg: "#ffffff", inputBorder: "#ccc",
    accent: "#b8860b", green: "#1a8a4a", red: "#c0392b", blue: "#2471a3", orange: "#d35400",
    chartLine: "#b8860b", chartGreen: "#1a8a4a", chartRed: "#c0392b",
    kpiBg: "#ffffff", kpiBorder: "#ddd",
    tabActive: "#b8860b", tabInactive: "#999",
    stickyBg: "#f5f5f0", summaryBg: "#faf8f0", ingresosBg: "#f0f5f0",
    negZone: "rgba(192,57,43,0.08)", uploadBg: "#fafafa", uploadBorder: "#ccc",
  },
};

export default function App() {
  const saved = useRef(loadSaved());
  const d = saved.current;

  const [obraName, setObraName] = useState(d?.obraName || "Mi Obra");
  const [disponible, setDisponible] = useState(typeof d?.disponible === "number" ? d.disponible : 0);
  const [cobranzas, setCobranzas] = useState(Array.isArray(d?.cobranzas) ? d.cobranzas : Array(N).fill(0));
  const [rubros, setRubros] = useState(Array.isArray(d?.rubros) ? d.rubros : []);
  const [otrosGastos, setOtrosGastos] = useState(Array.isArray(d?.otrosGastos) ? d.otrosGastos : Array(N).fill(0));
  const [activeTab, setActiveTab] = useState("ingresos");
  const [nextId, setNextId] = useState(typeof d?.nextId === "number" ? d.nextId : 1);
  const [uploadMsg, setUploadMsg] = useState({ ingresos: "", egresos: "" });
  const [dark, setDark] = useState(d?.dark !== false);
  const ingFileRef = useRef(null);
  const egrFileRef = useRef(null);

  const t = dark ? themes.dark : themes.light;

  const saveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ obraName, disponible, cobranzas, rubros, otrosGastos, nextId, dark })); } catch (e) {}
    }, 400);
  }, [obraName, disponible, cobranzas, rubros, otrosGastos, nextId, dark]);

  const handleIngresosUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { setUploadMsg(p => ({ ...p, ingresos: "⚠ Necesita al menos 2 filas" })); return; }
        const vals = data[1]; setDisponible(numParse(vals[0]));
        const nc = Array(N).fill(0);
        for (let i = 0; i < N; i++) nc[i] = numParse(vals[i + 1]);
        setCobranzas(nc);
        setUploadMsg(p => ({ ...p, ingresos: "✓ Ingresos cargados" }));
      } catch (err) { setUploadMsg(p => ({ ...p, ingresos: "⚠ Error: " + err.message })); }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  const handleEgresosUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { setUploadMsg(p => ({ ...p, egresos: "⚠ Necesita al menos 2 filas" })); return; }
        let id = nextId; const nr = [];
        for (let r = 1; r < data.length; r++) {
          const row = data[r]; if (!row[0] || String(row[0]).trim() === "") continue;
          const nombre = String(row[0]).trim(); const total = numParse(row[1]);
          const pagos = Array(N).fill(0);
          for (let i = 0; i < N; i++) pagos[i] = numParse(row[i + 2]);
          nr.push({ id: id++, nombre, total, pct: 0, pagos });
        }
        setRubros(nr); setNextId(id);
        setUploadMsg(p => ({ ...p, egresos: `✓ ${nr.length} rubros cargados` }));
      } catch (err) { setUploadMsg(p => ({ ...p, egresos: "⚠ Error: " + err.message })); }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  const downloadIngresosTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Disponibilidad", ...MONTHS], [0, ...Array(N).fill(0)]]);
    ws["!cols"] = Array(N + 1).fill({ wch: 16 });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ingresos");
    XLSX.writeFile(wb, "template_ingresos.xlsx");
  };

  const downloadEgresosTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Rubro", "Total", ...MONTHS], ["Ej: Hormigón", 5000000, ...Array(N).fill(0)]]);
    ws["!cols"] = [{ wch: 24 }, ...Array(N + 1).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Egresos");
    XLSX.writeFile(wb, "template_egresos.xlsx");
  };

  const updateCobranza = (i, v) => { const c = [...cobranzas]; c[i] = parseFloat(v) || 0; setCobranzas(c); };
  const updateRubroPago = (id, mi, v) => {
    setRubros(prev => prev.map(r => r.id !== id ? r : { ...r, pagos: r.pagos.map((p, i) => i === mi ? (parseFloat(v) || 0) : p) }));
  };
  const updateRubroField = (id, f, v) => {
    setRubros(prev => prev.map(r => r.id !== id ? r : { ...r, [f]: (f === "total" || f === "pct") ? (parseFloat(v) || 0) : v }));
  };
  const addRubro = () => { setRubros(prev => [...prev, { id: nextId, nombre: "Nuevo rubro", total: 0, pct: 0, pagos: Array(N).fill(0) }]); setNextId(n => n + 1); };
  const removeRubro = (id) => setRubros(prev => prev.filter(r => r.id !== id));
  const updateOtros = (i, v) => { const o = [...otrosGastos]; o[i] = parseFloat(v) || 0; setOtrosGastos(o); };

  const calcs = useMemo(() => {
    const egresosPorMes = Array(N).fill(0);
    rubros.forEach(r => { r.pagos.forEach((p, i) => { egresosPorMes[i] += p; }); });
    otrosGastos.forEach((g, i) => { egresosPorMes[i] += g; });
    const flujo = []; let acum = disponible;
    for (let i = 0; i < N; i++) { acum += cobranzas[i] - egresosPorMes[i]; flujo.push(acum); }
    const totalIngresos = disponible + cobranzas.reduce((a, b) => a + b, 0);
    const totalEgresos = egresosPorMes.reduce((a, b) => a + b, 0);
    const totalRubros = rubros.reduce((a, r) => a + r.total, 0);
    const totalProgramado = rubros.reduce((a, r) => a + r.pagos.reduce((s, p) => s + p, 0), 0);
    return { egresosPorMes, flujo, totalIngresos, totalEgresos, totalRubros, totalProgramado };
  }, [rubros, cobranzas, disponible, otrosGastos]);

  // Chart
  const allV = [...calcs.flujo, disponible];
  const maxF = Math.max(...allV, 1), minF = Math.min(...allV, 0), rng = maxF - minF || 1;
  const cH = 200, cW = 740, pL = 65, pR = 45, pT = 20, pB = 40;
  const plW = cW - pL - pR, plH = cH - pT - pB;
  const toX = (i) => pL + (i / (N - 1)) * plW;
  const toY = (v) => pT + plH - ((v - minF) / rng) * plH;
  const zY = toY(0);
  const aPath = calcs.flujo.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ") + ` L${toX(N - 1)},${zY} L${toX(0)},${zY} Z`;
  const lPath = calcs.flujo.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");

  const tabs = [
    { key: "ingresos", label: "Ingresos", icon: "↓" },
    { key: "egresos", label: "Egresos", icon: "↑" },
    { key: "resumen", label: "Resumen", icon: "≡" },
  ];

  const inp = { width: "100%", padding: "6px 8px", border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.text, borderRadius: "3px", fontSize: "13px", textAlign: "right", outline: "none", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };
  const btn = { padding: "8px 16px", background: t.bg2, border: `1px solid ${t.border}`, color: t.accent, borderRadius: "3px", cursor: "pointer", fontSize: "12px", fontWeight: "600" };
  const upBox = { padding: "16px", border: `1px dashed ${t.uploadBorder}`, borderRadius: "4px", background: t.uploadBg, textAlign: "center", cursor: "pointer" };
  const gridLine = dark ? "#1a1a1a" : "#ddd";
  const chartText = dark ? "#777" : "#888";

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", background: t.bg, color: t.text, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: t.bgHeader, borderBottom: `2px solid ${t.borderHeader}`, padding: "20px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "8px", height: "32px", background: t.accent, borderRadius: "1px" }} />
            <div>
              <input value={obraName} onChange={e => setObraName(e.target.value)} style={{ background: "transparent", border: "none", color: t.accent, fontSize: "22px", fontWeight: "700", outline: "none", letterSpacing: "0.5px", padding: 0, width: "300px" }} />
              <div style={{ fontSize: "12px", color: t.textMuted, letterSpacing: "2px", textTransform: "uppercase", marginTop: "2px" }}>Cash Flow · Planificación de Obra</div>
            </div>
          </div>
          <button onClick={() => setDark(p => !p)} style={{
            background: dark ? "#222" : "#e0e0e0", border: "none", borderRadius: "20px", width: "48px", height: "26px",
            cursor: "pointer", position: "relative", transition: "background 0.3s"
          }}>
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%", background: dark ? "#f0b429" : "#b8860b",
              position: "absolute", top: "3px", left: dark ? "25px" : "3px", transition: "left 0.3s",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px"
            }}>
              {dark ? "☀" : "🌙"}
            </div>
          </button>
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap" }}>
          {[
            { label: "Disponible hoy", value: fmt(disponible), color: t.accent },
            { label: "Total ingresos", value: fmt(calcs.totalIngresos), color: t.green },
            { label: "Total egresos", value: fmt(calcs.totalEgresos), color: t.red },
            { label: "Saldo final", value: fmt(calcs.flujo[N - 1] || 0), color: (calcs.flujo[N - 1] || 0) >= 0 ? t.green : t.red },
          ].map((kpi, i) => (
            <div key={i} style={{ flex: "1 1 140px", padding: "10px 14px", background: t.kpiBg, border: `1px solid ${t.kpiBorder}`, borderRadius: "4px" }}>
              <div style={{ fontSize: "10px", color: t.textMuted, textTransform: "uppercase", letterSpacing: "1.5px" }}>{kpi.label}</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: kpi.color, marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart 1 */}
      <div style={{ padding: "16px 24px 8px" }}>
        <div style={{ fontSize: "11px", color: t.textMuted, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Flujo acumulado proyectado</div>
        <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: "100%", maxHeight: "220px" }}>
          <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.chartLine} stopOpacity="0.18" /><stop offset="100%" stopColor={t.chartLine} stopOpacity="0.02" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((p, i) => { const v = minF + p * rng, y = toY(v); return (<g key={i}><line x1={pL} y1={y} x2={cW - pR} y2={y} stroke={gridLine} strokeWidth="0.5" /><text x={pL - 8} y={y + 4} fill={chartText} fontSize="9" textAnchor="end" fontFamily="monospace">{fmtChart(v)}</text></g>); })}
          {minF < 0 && maxF > 0 && <line x1={pL} y1={zY} x2={cW - pR} y2={zY} stroke={t.textMuted} strokeWidth="1" strokeDasharray="4,3" />}
          {MONTHS.map((_, i) => <text key={i} x={toX(i)} y={cH - 8} fill={chartText} fontSize="8" textAnchor="middle" fontFamily="sans-serif">{SHORT[i]}</text>)}
          <path d={aPath} fill="url(#ag)" />
          <path d={lPath} fill="none" stroke={t.chartLine} strokeWidth="2.5" strokeLinejoin="round" />
          {calcs.flujo.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="4" fill={v >= 0 ? t.chartLine : t.red} stroke={t.bg} strokeWidth="1.5" />)}
          {minF < 0 && <rect x={pL} y={zY} width={plW} height={Math.max(0, toY(minF) - zY)} fill={t.negZone} />}
        </svg>
      </div>

      {/* Chart 2 */}
      {(() => {
        const ingAcum = [], egrAcum = [];
        let si = disponible, se = 0;
        for (let i = 0; i < N; i++) { si += cobranzas[i]; se += calcs.egresosPorMes[i]; ingAcum.push(si); egrAcum.push(se); }
        const all2 = [...ingAcum, ...egrAcum, disponible];
        const max2 = Math.max(...all2, 1), min2 = Math.min(...all2, 0), rng2 = max2 - min2 || 1;
        const toY2 = (v) => pT + plH - ((v - min2) / rng2) * plH;
        const ingPath = ingAcum.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY2(v)}`).join(" ");
        const egrPath = egrAcum.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY2(v)}`).join(" ");
        const ingArea = ingPath + ` L${toX(N-1)},${toY2(min2)} L${toX(0)},${toY2(min2)} Z`;
        const egrArea = egrPath + ` L${toX(N-1)},${toY2(min2)} L${toX(0)},${toY2(min2)} Z`;
        return (
          <div style={{ padding: "8px 24px 8px" }}>
            <div style={{ fontSize: "11px", color: t.textMuted, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Ingresos vs Egresos acumulados</div>
            <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: "100%", maxHeight: "220px" }}>
              <defs>
                <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.chartGreen} stopOpacity="0.15" /><stop offset="100%" stopColor={t.chartGreen} stopOpacity="0.01" /></linearGradient>
                <linearGradient id="egrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.chartRed} stopOpacity="0.15" /><stop offset="100%" stopColor={t.chartRed} stopOpacity="0.01" /></linearGradient>
              </defs>
              {[0, .25, .5, .75, 1].map((p, i) => { const v = min2 + p * rng2, y = toY2(v); return (<g key={i}><line x1={pL} y1={y} x2={cW - pR} y2={y} stroke={gridLine} strokeWidth="0.5" /><text x={pL - 8} y={y + 4} fill={chartText} fontSize="9" textAnchor="end" fontFamily="monospace">{fmtChart(v)}</text></g>); })}
              {MONTHS.map((_, i) => <text key={i} x={toX(i)} y={cH - 8} fill={chartText} fontSize="8" textAnchor="middle" fontFamily="sans-serif">{SHORT[i]}</text>)}
              <path d={ingArea} fill="url(#ingGrad)" />
              <path d={egrArea} fill="url(#egrGrad)" />
              <path d={ingPath} fill="none" stroke={t.chartGreen} strokeWidth="2.5" strokeLinejoin="round" />
              <path d={egrPath} fill="none" stroke={t.chartRed} strokeWidth="2.5" strokeLinejoin="round" />
              {ingAcum.map((v, i) => <circle key={`i${i}`} cx={toX(i)} cy={toY2(v)} r="4" fill={t.chartGreen} stroke={t.bg} strokeWidth="1.5" />)}
              {egrAcum.map((v, i) => <circle key={`e${i}`} cx={toX(i)} cy={toY2(v)} r="4" fill={t.chartRed} stroke={t.bg} strokeWidth="1.5" />)}
              <text x={toX(N-1) + 5} y={toY2(ingAcum[N-1]) - 6} fill={t.chartGreen} fontSize="9" fontFamily="monospace" fontWeight="bold">{fmtChart(ingAcum[N-1])}</text>
              <text x={toX(N-1) + 5} y={toY2(egrAcum[N-1]) + 14} fill={t.chartRed} fontSize="9" fontFamily="monospace" fontWeight="bold">{fmtChart(egrAcum[N-1])}</text>
            </svg>
            <div style={{ display: "flex", gap: "24px", justifyContent: "center", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: t.chartGreen, fontWeight: "600" }}>● Ingresos acumulados</span>
              <span style={{ fontSize: "11px", color: t.chartRed, fontWeight: "600" }}>● Egresos acumulados</span>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}`, margin: "0 24px" }}>
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setActiveTab(tb.key)} style={{
            padding: "10px 16px", background: "transparent", border: "none",
            borderBottom: activeTab === tb.key ? `3px solid ${t.tabActive}` : "3px solid transparent",
            color: activeTab === tb.key ? t.tabActive : t.tabInactive, cursor: "pointer", fontSize: "13px", fontWeight: "700", letterSpacing: "0.5px"
          }}>{tb.icon} {tb.label}</button>
        ))}
      </div>

      <div style={{ padding: "16px 24px 24px" }}>
        {/* INGRESOS */}
        {activeTab === "ingresos" && (
          <div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
              <div style={upBox} onClick={() => ingFileRef.current?.click()}>
                <span style={{ fontSize: "13px", color: t.textSoft }}>📂 Subir Excel Ingresos</span>
              </div>
              <button onClick={downloadIngresosTemplate} style={{ ...btn, padding: "8px 12px", fontSize: "11px" }}>↓ Template</button>
            </div>
            <input ref={ingFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleIngresosUpload} style={{ display: "none" }} />
            {uploadMsg.ingresos && <div style={{ marginBottom: "12px", fontSize: "12px", color: uploadMsg.ingresos.startsWith("✓") ? t.green : t.red }}>{uploadMsg.ingresos}</div>}

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "11px", color: t.textSoft, textTransform: "uppercase", letterSpacing: "1px" }}>Disponibilidad actual</label>
              <input type="number" value={disponible || ""} onChange={e => setDisponible(parseFloat(e.target.value) || 0)} placeholder="0" style={{ ...inp, width: "220px", fontSize: "16px", marginTop: "6px", display: "block" }} />
            </div>
            <div style={{ fontSize: "11px", color: t.textSoft, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Cobranzas pactadas por mes</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              {MONTHS.map((m, i) => (
                <div key={i}>
                  <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "4px" }}>{m}</div>
                  <input type="number" value={cobranzas[i] || ""} onChange={e => updateCobranza(i, e.target.value)} placeholder="0" style={inp} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: "16px", padding: "12px 14px", background: t.ingresosBg, border: `1px solid ${t.border}`, borderRadius: "4px", fontSize: "13px" }}>
              Total cobranzas: <strong style={{ color: t.green }}>{fmt(cobranzas.reduce((a, b) => a + b, 0))}</strong> · Fondos totales: <strong style={{ color: t.accent }}>{fmt(calcs.totalIngresos)}</strong>
            </div>
          </div>
        )}

        {/* EGRESOS */}
        {activeTab === "egresos" && (
          <div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
              <div style={upBox} onClick={() => egrFileRef.current?.click()}>
                <span style={{ fontSize: "13px", color: t.textSoft }}>📂 Subir Excel Egresos</span>
              </div>
              <button onClick={downloadEgresosTemplate} style={{ ...btn, padding: "8px 12px", fontSize: "11px" }}>↓ Template</button>
            </div>
            <input ref={egrFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleEgresosUpload} style={{ display: "none" }} />
            {uploadMsg.egresos && <div style={{ marginBottom: "12px", fontSize: "12px", color: uploadMsg.egresos.startsWith("✓") ? t.green : t.red }}>{uploadMsg.egresos}</div>}

            {rubros.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: t.textMuted, fontSize: "13px" }}>Sin rubros cargados</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${t.border}` }}>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: t.textSoft, fontWeight: "700", minWidth: "130px", position: "sticky", left: 0, background: t.bg, zIndex: 1 }}>Rubro</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", color: t.accent, fontWeight: "700", width: "95px" }}>Total</th>
                      <th style={{ textAlign: "center", padding: "8px 4px", color: t.blue, fontWeight: "700", width: "50px" }}>%</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: t.blue, fontWeight: "700", width: "90px" }}>Anticipo</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: t.orange, fontWeight: "700", width: "90px" }}>Saldo</th>
                      {MONTHS.map((_, i) => <th key={i} style={{ textAlign: "center", padding: "8px 2px", color: t.textMuted, fontWeight: "600", width: "68px" }}>{SHORT[i]}</th>)}
                      <th style={{ textAlign: "right", padding: "8px 6px", color: t.textSoft, fontWeight: "700", width: "85px" }}>Prog.</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", color: t.textMuted, fontWeight: "700", width: "80px" }}>Pend.</th>
                      <th style={{ width: "30px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubros.map(r => {
                      const prog = r.pagos.reduce((a, b) => a + b, 0);
                      const pend = r.total - prog;
                      const anticipo = r.total && r.pct ? Math.round(r.total * r.pct / 100) : 0;
                      const saldo = r.total - anticipo;
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${dark ? "#1a1a1a" : "#e0e0e0"}` }}>
                          <td style={{ padding: "6px", position: "sticky", left: 0, background: t.bg, zIndex: 1 }}>
                            <input value={r.nombre} onChange={e => updateRubroField(r.id, "nombre", e.target.value)} style={{ ...inp, textAlign: "left", fontWeight: "600", border: "none", background: "transparent" }} />
                          </td>
                          <td style={{ padding: "4px" }}>
                            <input type="number" value={r.total || ""} onChange={e => updateRubroField(r.id, "total", e.target.value)} placeholder="0" style={{ ...inp, width: "90px" }} />
                          </td>
                          <td style={{ padding: "4px" }}>
                            <input type="number" value={r.pct || ""} onChange={e => updateRubroField(r.id, "pct", e.target.value)} placeholder="%" style={{ ...inp, width: "48px", textAlign: "center", fontSize: "12px", color: t.blue }} />
                          </td>
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: "700", color: t.blue, fontFamily: "monospace", fontSize: "12px" }}>
                            {anticipo > 0 ? fmt(anticipo) : "-"}
                          </td>
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: "700", color: t.orange, fontFamily: "monospace", fontSize: "12px" }}>
                            {anticipo > 0 ? fmt(saldo) : "-"}
                          </td>
                          {MONTHS.map((_, i) => (
                            <td key={i} style={{ padding: "3px 2px" }}>
                              <input type="number" value={r.pagos[i] || ""} onChange={e => updateRubroPago(r.id, i, e.target.value)} placeholder="0" style={{ ...inp, width: "62px", textAlign: "center", fontSize: "12px" }} />
                            </td>
                          ))}
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: "700", color: t.textSoft, fontFamily: "monospace", fontSize: "12px" }}>{fmt(prog)}</td>
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: "700", fontFamily: "monospace", fontSize: "12px", color: pend > 0 ? t.orange : pend < 0 ? t.red : t.green }}>
                            {pend === 0 ? "✓" : fmt(pend)}
                          </td>
                          <td style={{ padding: "4px" }}>
                            <button onClick={() => removeRubro(r.id)} style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", fontSize: "16px", fontWeight: "bold" }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: `2px solid ${t.border}` }}>
                      <td style={{ padding: "6px", color: t.textSoft, fontSize: "12px", fontWeight: "600", position: "sticky", left: 0, background: t.bg }} colSpan={5}>Otros gastos</td>
                      {MONTHS.map((_, i) => (
                        <td key={i} style={{ padding: "3px 2px" }}>
                          <input type="number" value={otrosGastos[i] || ""} onChange={e => updateOtros(i, e.target.value)} placeholder="0" style={{ ...inp, width: "62px", textAlign: "center", fontSize: "12px" }} />
                        </td>
                      ))}
                      <td style={{ padding: "6px", textAlign: "right", fontWeight: "700", color: t.textSoft, fontFamily: "monospace", fontSize: "12px" }}>{fmt(otrosGastos.reduce((a, b) => a + b, 0))}</td>
                      <td></td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={addRubro} style={btn}>+ Agregar rubro</button>
              {rubros.length > 0 && calcs.totalRubros !== calcs.totalProgramado && (
                <span style={{ fontSize: "12px", color: t.orange, fontWeight: "600" }}>
                  ⚠ Total: {fmt(calcs.totalRubros)} — Programado: {fmt(calcs.totalProgramado)} (dif: {fmt(calcs.totalRubros - calcs.totalProgramado)})
                </span>
              )}
            </div>
          </div>
        )}

        {/* RESUMEN */}
        {activeTab === "resumen" && (
          <div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", fontFamily: "monospace" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${t.borderHeader}` }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: t.accent, fontWeight: "700", minWidth: "130px", position: "sticky", left: 0, background: t.bg, zIndex: 1 }}>Concepto</th>
                    {MONTHS.map((_, i) => <th key={i} style={{ textAlign: "right", padding: "8px 6px", color: t.textSoft, fontSize: "11px", fontWeight: "600" }}>{SHORT[i]}</th>)}
                    <th style={{ textAlign: "right", padding: "8px 6px", color: t.accent, fontWeight: "700" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: t.ingresosBg }}>
                    <td style={{ padding: "6px", color: t.green, fontWeight: "700", position: "sticky", left: 0, background: t.ingresosBg, zIndex: 1 }}>Cobranzas</td>
                    {cobranzas.map((c, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: t.green, fontWeight: "600" }}>{c > 0 ? fmt(c) : "-"}</td>)}
                    <td style={{ textAlign: "right", padding: "6px", color: t.green, fontWeight: "700" }}>{fmt(cobranzas.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                  {rubros.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${dark ? "#1a1a1a" : "#e0e0e0"}` }}>
                      <td style={{ padding: "6px", color: t.text, fontWeight: "500", position: "sticky", left: 0, background: t.bg, zIndex: 1 }}>{r.nombre}</td>
                      {r.pagos.map((p, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: p > 0 ? t.red : t.textMuted }}>{p > 0 ? fmt(p) : "-"}</td>)}
                      <td style={{ textAlign: "right", padding: "6px", color: t.red, fontWeight: "700" }}>{fmt(r.pagos.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  ))}
                  {otrosGastos.some(g => g > 0) && (
                    <tr style={{ borderBottom: `1px solid ${dark ? "#1a1a1a" : "#e0e0e0"}` }}>
                      <td style={{ padding: "6px", color: t.text, fontWeight: "500", position: "sticky", left: 0, background: t.bg, zIndex: 1 }}>Otros gastos</td>
                      {otrosGastos.map((g, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: g > 0 ? t.red : t.textMuted }}>{g > 0 ? fmt(g) : "-"}</td>)}
                      <td style={{ textAlign: "right", padding: "6px", color: t.red, fontWeight: "700" }}>{fmt(otrosGastos.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: `2px solid ${t.borderHeader}`, background: t.summaryBg }}>
                    <td style={{ padding: "8px 6px", color: t.accent, fontWeight: "700", position: "sticky", left: 0, background: t.summaryBg, zIndex: 1 }}>Flujo neto</td>
                    {MONTHS.map((_, i) => { const n = cobranzas[i] - calcs.egresosPorMes[i]; return <td key={i} style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: n >= 0 ? t.green : t.red }}>{fmt(n)}</td>; })}
                    <td style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: t.accent }}>{fmt(cobranzas.reduce((a, b) => a + b, 0) - calcs.totalEgresos)}</td>
                  </tr>
                  <tr style={{ background: t.summaryBg }}>
                    <td style={{ padding: "8px 6px", color: t.accent, fontWeight: "700", position: "sticky", left: 0, background: t.summaryBg, zIndex: 1 }}>Saldo acum.</td>
                    {calcs.flujo.map((v, i) => <td key={i} style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: v >= 0 ? t.accent : t.red }}>{fmt(v)}</td>)}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {calcs.flujo.some(v => v < 0) && (
              <div style={{ marginTop: "16px", padding: "12px 14px", background: dark ? "#1a0a0a" : "#fde8e8", border: `1px solid ${t.red}`, borderRadius: "4px", fontSize: "12px", color: t.red, fontWeight: "600" }}>
                ⚠ Hay meses con saldo negativo.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
