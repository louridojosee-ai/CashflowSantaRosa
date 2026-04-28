import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const MONTHS = ["May 2026","Jun 2026","Jul 2026","Ago 2026","Sep 2026","Oct 2026","Nov 2026","Dic 2026","Ene 2027","Feb 2027","Mar 2027"];
const SHORT = MONTHS.map(m => m.split(" ")[0]);
const N = MONTHS.length;

const fmt = (n) => {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(0) + "k";
  return sign + "$" + abs.toFixed(0);
};

const fmtFull = (n) => {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
};

const numParse = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$.%\s]/g, "").replace(/,/g, ".");
  return parseFloat(s) || 0;
};

export default function CashFlowObra() {
  const [obraName, setObraName] = useState("Mi Obra");
  const [disponible, setDisponible] = useState(0);
  const [cobranzas, setCobranzas] = useState(Array(N).fill(0));
  const [rubros, setRubros] = useState([]);
  const [otrosGastos, setOtrosGastos] = useState(Array(N).fill(0));
  const [activeTab, setActiveTab] = useState("ingresos");
  const [nextId, setNextId] = useState(1);
  const [uploadMsg, setUploadMsg] = useState({ ingresos: "", egresos: "" });
  const [loaded, setLoaded] = useState(false);
  const ingFileRef = useRef(null);
  const egrFileRef = useRef(null);

  // ---- Persistence: load on mount ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cashflow-data");
      if (raw) {
        const d = JSON.parse(raw);
        if (d.obraName) setObraName(d.obraName);
        if (typeof d.disponible === "number") setDisponible(d.disponible);
        if (Array.isArray(d.cobranzas)) setCobranzas(d.cobranzas);
        if (Array.isArray(d.rubros)) setRubros(d.rubros);
        if (Array.isArray(d.otrosGastos)) setOtrosGastos(d.otrosGastos);
        if (typeof d.nextId === "number") setNextId(d.nextId);
      }
    } catch (e) {
      // First time or no data yet
    }
    setLoaded(true);
  }, []);

  // ---- Persistence: save on any data change ----
  const saveRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      try {
        localStorage.setItem("cashflow-data", JSON.stringify({
          obraName, disponible, cobranzas, rubros, otrosGastos, nextId
        }));
      } catch (e) { /* storage full or unavailable */ }
    }, 400);
  }, [obraName, disponible, cobranzas, rubros, otrosGastos, nextId, loaded]);

  const handleIngresosUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { setUploadMsg(p => ({ ...p, ingresos: "⚠ Necesita al menos 2 filas" })); return; }
        const vals = data[1];
        setDisponible(numParse(vals[0]));
        const nc = Array(N).fill(0);
        for (let i = 0; i < N; i++) nc[i] = numParse(vals[i + 1]);
        setCobranzas(nc);
        setUploadMsg(p => ({ ...p, ingresos: "✓ Ingresos cargados" }));
      } catch (err) { setUploadMsg(p => ({ ...p, ingresos: "⚠ Error: " + err.message })); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleEgresosUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { setUploadMsg(p => ({ ...p, egresos: "⚠ Necesita al menos 2 filas" })); return; }
        let id = nextId;
        const nr = [];
        for (let r = 1; r < data.length; r++) {
          const row = data[r];
          if (!row[0] || String(row[0]).trim() === "") continue;
          const nombre = String(row[0]).trim();
          const total = numParse(row[1]);
          const pagos = Array(N).fill(0);
          for (let i = 0; i < N; i++) pagos[i] = numParse(row[i + 2]);
          nr.push({ id: id++, nombre, total, pagos });
        }
        setRubros(nr);
        setNextId(id);
        setUploadMsg(p => ({ ...p, egresos: `✓ ${nr.length} rubros cargados` }));
      } catch (err) { setUploadMsg(p => ({ ...p, egresos: "⚠ Error: " + err.message })); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const downloadIngresosTemplate = () => {
    const header = ["Disponibilidad", ...MONTHS];
    const row = [0, ...Array(N).fill(0)];
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    ws["!cols"] = header.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ingresos");
    XLSX.writeFile(wb, "template_ingresos.xlsx");
  };

  const downloadEgresosTemplate = () => {
    const header = ["Rubro", "Total", ...MONTHS];
    const ex1 = ["Ej: Hormigón", 5000000, ...Array(N).fill(0)];
    const ex2 = ["Ej: Mano de obra", 3000000, ...Array(N).fill(0)];
    const ws = XLSX.utils.aoa_to_sheet([header, ex1, ex2]);
    ws["!cols"] = header.map((_, i) => ({ wch: i === 0 ? 24 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Egresos");
    XLSX.writeFile(wb, "template_egresos.xlsx");
  };

  const updateCobranza = (i, v) => { const c = [...cobranzas]; c[i] = parseFloat(v) || 0; setCobranzas(c); };
  const updateRubroPago = (id, mi, v) => {
    setRubros(prev => prev.map(r => r.id !== id ? r : { ...r, pagos: r.pagos.map((p, i) => i === mi ? (parseFloat(v) || 0) : p) }));
  };
  const updateRubroField = (id, f, v) => {
    setRubros(prev => prev.map(r => r.id !== id ? r : { ...r, [f]: f === "total" ? (parseFloat(v) || 0) : v }));
  };
  const addRubro = () => { setRubros(prev => [...prev, { id: nextId, nombre: "Nuevo rubro", total: 0, pagos: Array(N).fill(0) }]); setNextId(n => n + 1); };
  const removeRubro = (id) => setRubros(prev => prev.filter(r => r.id !== id));
  const updateOtros = (i, v) => { const o = [...otrosGastos]; o[i] = parseFloat(v) || 0; setOtrosGastos(o); };

  const calcs = useMemo(() => {
    const egresosPorMes = Array(N).fill(0);
    rubros.forEach(r => { r.pagos.forEach((p, i) => { egresosPorMes[i] += p; }); });
    otrosGastos.forEach((g, i) => { egresosPorMes[i] += g; });
    const flujo = [];
    let acum = disponible;
    for (let i = 0; i < N; i++) { acum += cobranzas[i] - egresosPorMes[i]; flujo.push(acum); }
    const totalIngresos = disponible + cobranzas.reduce((a, b) => a + b, 0);
    const totalEgresos = egresosPorMes.reduce((a, b) => a + b, 0);
    const totalRubros = rubros.reduce((a, r) => a + r.total, 0);
    const totalProgramado = rubros.reduce((a, r) => a + r.pagos.reduce((s, p) => s + p, 0), 0);
    return { egresosPorMes, flujo, totalIngresos, totalEgresos, totalRubros, totalProgramado };
  }, [rubros, cobranzas, disponible, otrosGastos]);

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

  const inp = { width: "100%", padding: "6px 8px", border: "1px solid #2a2a2a", background: "#0a0a0a", color: "#e0e0e0", borderRadius: "3px", fontSize: "13px", textAlign: "right", outline: "none", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };
  const btn = { padding: "8px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#d4a017", borderRadius: "3px", cursor: "pointer", fontSize: "12px", fontWeight: "600" };
  const upBox = { padding: "16px", border: "1px dashed #2a2a2a", borderRadius: "4px", background: "#080808", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" };

  if (!loaded) return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "#050505", color: "#666", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "14px", marginBottom: "8px" }}>Cargando datos...</div>
        <div style={{ width: "40px", height: "3px", background: "#d4a017", borderRadius: "2px", margin: "0 auto" }} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", background: "#050505", color: "#d4d4d4", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d0d0d 0%, #1a1205 100%)", borderBottom: "1px solid #2a2207", padding: "20px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
          <div style={{ width: "8px", height: "32px", background: "#d4a017", borderRadius: "1px" }} />
          <div>
            <input value={obraName} onChange={e => setObraName(e.target.value)} style={{ background: "transparent", border: "none", color: "#d4a017", fontSize: "22px", fontWeight: "700", outline: "none", letterSpacing: "0.5px", padding: 0, width: "300px" }} />
            <div style={{ fontSize: "12px", color: "#666", letterSpacing: "2px", textTransform: "uppercase", marginTop: "2px" }}>Cash Flow · Planificación de Obra</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap" }}>
          {[
            { label: "Disponible hoy", value: fmtFull(disponible), color: "#d4a017" },
            { label: "Total ingresos", value: fmtFull(calcs.totalIngresos), color: "#4a9" },
            { label: "Total egresos", value: fmtFull(calcs.totalEgresos), color: "#c55" },
            { label: "Saldo final", value: fmtFull(calcs.flujo[N - 1] || 0), color: (calcs.flujo[N - 1] || 0) >= 0 ? "#4a9" : "#ff4444" },
          ].map((kpi, i) => (
            <div key={i} style={{ flex: "1 1 140px", padding: "10px 14px", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "4px" }}>
              <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "1.5px" }}>{kpi.label}</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: kpi.color, marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: "16px 24px 8px" }}>
        <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Flujo acumulado proyectado</div>
        <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: "100%", maxHeight: "220px" }}>
          <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d4a017" stopOpacity="0.15" /><stop offset="100%" stopColor="#d4a017" stopOpacity="0.02" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((p, i) => { const v = minF + p * rng, y = toY(v); return (<g key={i}><line x1={pL} y1={y} x2={cW - pR} y2={y} stroke="#1a1a1a" strokeWidth="0.5" /><text x={pL - 8} y={y + 4} fill="#555" fontSize="9" textAnchor="end" fontFamily="monospace">{fmt(v)}</text></g>); })}
          {minF < 0 && maxF > 0 && <line x1={pL} y1={zY} x2={cW - pR} y2={zY} stroke="#444" strokeWidth="1" strokeDasharray="4,3" />}
          {MONTHS.map((_, i) => <text key={i} x={toX(i)} y={cH - 8} fill="#555" fontSize="8" textAnchor="middle" fontFamily="sans-serif">{SHORT[i]}</text>)}
          <path d={aPath} fill="url(#ag)" />
          <path d={lPath} fill="none" stroke="#d4a017" strokeWidth="2" strokeLinejoin="round" />
          {calcs.flujo.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill={v >= 0 ? "#d4a017" : "#ff4444"} stroke="#050505" strokeWidth="1" />)}
          {minF < 0 && <rect x={pL} y={zY} width={plW} height={Math.max(0, toY(minF) - zY)} fill="rgba(200,40,40,0.06)" />}
        </svg>
      </div>

      {/* Chart 2: Ingresos vs Egresos acumulados */}
      {(() => {
        const ingAcum = []; const egrAcum = [];
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
            <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Ingresos vs Egresos acumulados</div>
            <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: "100%", maxHeight: "220px" }}>
              <defs>
                <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#44aa99" stopOpacity="0.12" /><stop offset="100%" stopColor="#44aa99" stopOpacity="0.01" /></linearGradient>
                <linearGradient id="egrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cc5555" stopOpacity="0.12" /><stop offset="100%" stopColor="#cc5555" stopOpacity="0.01" /></linearGradient>
              </defs>
              {[0, .25, .5, .75, 1].map((p, i) => { const v = min2 + p * rng2, y = toY2(v); return (<g key={i}><line x1={pL} y1={y} x2={cW - pR} y2={y} stroke="#1a1a1a" strokeWidth="0.5" /><text x={pL - 8} y={y + 4} fill="#555" fontSize="9" textAnchor="end" fontFamily="monospace">{fmt(v)}</text></g>); })}
              {MONTHS.map((_, i) => <text key={i} x={toX(i)} y={cH - 8} fill="#555" fontSize="8" textAnchor="middle" fontFamily="sans-serif">{SHORT[i]}</text>)}
              <path d={ingArea} fill="url(#ingGrad)" />
              <path d={egrArea} fill="url(#egrGrad)" />
              <path d={ingPath} fill="none" stroke="#44aa99" strokeWidth="2.5" strokeLinejoin="round" />
              <path d={egrPath} fill="none" stroke="#cc5555" strokeWidth="2.5" strokeLinejoin="round" />
              {ingAcum.map((v, i) => <circle key={`i${i}`} cx={toX(i)} cy={toY2(v)} r="3.5" fill="#44aa99" stroke="#050505" strokeWidth="1" />)}
              {egrAcum.map((v, i) => <circle key={`e${i}`} cx={toX(i)} cy={toY2(v)} r="3.5" fill="#cc5555" stroke="#050505" strokeWidth="1" />)}
              {/* Values on last point */}
              <text x={toX(N-1) + 5} y={toY2(ingAcum[N-1]) - 6} fill="#44aa99" fontSize="9" fontFamily="monospace" fontWeight="bold">{fmt(ingAcum[N-1])}</text>
              <text x={toX(N-1) + 5} y={toY2(egrAcum[N-1]) + 14} fill="#cc5555" fontSize="9" fontFamily="monospace" fontWeight="bold">{fmt(egrAcum[N-1])}</text>
            </svg>
            <div style={{ display: "flex", gap: "24px", justifyContent: "center", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "#44aa99" }}>● Ingresos acumulados</span>
              <span style={{ fontSize: "11px", color: "#cc5555" }}>● Egresos acumulados</span>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", margin: "0 24px" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "10px 16px", background: "transparent", border: "none",
            borderBottom: activeTab === t.key ? "2px solid #d4a017" : "2px solid transparent",
            color: activeTab === t.key ? "#d4a017" : "#666", cursor: "pointer", fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px"
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      <div style={{ padding: "16px 24px 24px" }}>
        {/* INGRESOS */}
        {activeTab === "ingresos" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Cargar desde Excel</span>
                <button onClick={downloadIngresosTemplate} style={{ ...btn, padding: "4px 10px", fontSize: "11px", color: "#888", borderColor: "#222" }}>↓ Template</button>
              </div>
              <div style={upBox} onClick={() => ingFileRef.current?.click()}>
                <div style={{ fontSize: "13px", color: "#666" }}>Clic o arrastrá el Excel de <strong style={{ color: "#aaa" }}>Ingresos</strong></div>
                <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>Disponibilidad | May 2026 | Jun 2026 | ... | Mar 2027</div>
              </div>
              <input ref={ingFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleIngresosUpload} style={{ display: "none" }} />
              {uploadMsg.ingresos && <div style={{ marginTop: "8px", fontSize: "12px", color: uploadMsg.ingresos.startsWith("✓") ? "#4a9" : "#c55" }}>{uploadMsg.ingresos}</div>}
            </div>

            <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: "16px" }}>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "12px" }}>O editá manualmente:</div>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Disponibilidad actual</label>
                <input type="number" value={disponible || ""} onChange={e => setDisponible(parseFloat(e.target.value) || 0)} placeholder="0" style={{ ...inp, width: "220px", fontSize: "16px", marginTop: "6px", display: "block" }} />
              </div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Cobranzas pactadas por mes</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {MONTHS.map((m, i) => (
                  <div key={i}>
                    <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>{m}</div>
                    <input type="number" value={cobranzas[i] || ""} onChange={e => updateCobranza(i, e.target.value)} placeholder="0" style={inp} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", padding: "12px 14px", background: "#0d1a0d", border: "1px solid #1a2a1a", borderRadius: "4px", fontSize: "13px" }}>
                Total cobranzas: <strong style={{ color: "#4a9" }}>{fmtFull(cobranzas.reduce((a, b) => a + b, 0))}</strong> · Fondos totales: <strong style={{ color: "#d4a017" }}>{fmtFull(calcs.totalIngresos)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* EGRESOS */}
        {activeTab === "egresos" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Cargar desde Excel</span>
                <button onClick={downloadEgresosTemplate} style={{ ...btn, padding: "4px 10px", fontSize: "11px", color: "#888", borderColor: "#222" }}>↓ Template</button>
              </div>
              <div style={upBox} onClick={() => egrFileRef.current?.click()}>
                <div style={{ fontSize: "13px", color: "#666" }}>Clic o arrastrá el Excel de <strong style={{ color: "#aaa" }}>Egresos</strong></div>
                <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>Rubro | Total | May 2026 | Jun 2026 | ... | Mar 2027</div>
              </div>
              <input ref={egrFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleEgresosUpload} style={{ display: "none" }} />
              {uploadMsg.egresos && <div style={{ marginTop: "8px", fontSize: "12px", color: uploadMsg.egresos.startsWith("✓") ? "#4a9" : "#c55" }}>{uploadMsg.egresos}</div>}
            </div>

            <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: "16px" }}>
              {rubros.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "#444", fontSize: "13px" }}>Subí un Excel o agregá rubros manualmente</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                        <th style={{ textAlign: "left", padding: "8px 6px", color: "#888", fontWeight: "600", minWidth: "130px", position: "sticky", left: 0, background: "#050505", zIndex: 1 }}>Rubro</th>
                        <th style={{ textAlign: "right", padding: "8px 6px", color: "#d4a017", fontWeight: "600", width: "95px" }}>Total</th>
                        {MONTHS.map((_, i) => <th key={i} style={{ textAlign: "center", padding: "8px 2px", color: "#666", fontWeight: "500", width: "68px" }}>{SHORT[i]}</th>)}
                        <th style={{ textAlign: "right", padding: "8px 6px", color: "#888", fontWeight: "600", width: "85px" }}>Prog.</th>
                        <th style={{ textAlign: "right", padding: "8px 6px", color: "#555", fontWeight: "600", width: "80px" }}>Pend.</th>
                        <th style={{ width: "30px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rubros.map(r => {
                        const prog = r.pagos.reduce((a, b) => a + b, 0);
                        const pend = r.total - prog;
                        return (
                          <tr key={r.id} style={{ borderBottom: "1px solid #111" }}>
                            <td style={{ padding: "6px", position: "sticky", left: 0, background: "#050505", zIndex: 1 }}>
                              <input value={r.nombre} onChange={e => updateRubroField(r.id, "nombre", e.target.value)} style={{ ...inp, textAlign: "left", fontWeight: "500", border: "none", background: "transparent" }} />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input type="number" value={r.total || ""} onChange={e => updateRubroField(r.id, "total", e.target.value)} placeholder="0" style={{ ...inp, width: "90px" }} />
                            </td>
                            {MONTHS.map((_, i) => (
                              <td key={i} style={{ padding: "3px 2px" }}>
                                <input type="number" value={r.pagos[i] || ""} onChange={e => updateRubroPago(r.id, i, e.target.value)} placeholder="0" style={{ ...inp, width: "62px", textAlign: "center", fontSize: "12px" }} />
                              </td>
                            ))}
                            <td style={{ padding: "6px", textAlign: "right", fontWeight: "600", color: "#aaa", fontFamily: "monospace", fontSize: "12px" }}>{fmt(prog)}</td>
                            <td style={{ padding: "6px", textAlign: "right", fontWeight: "600", fontFamily: "monospace", fontSize: "12px", color: pend > 0 ? "#e8a735" : pend < 0 ? "#ff4444" : "#4a9" }}>
                              {pend === 0 ? "✓" : fmt(pend)}
                            </td>
                            <td style={{ padding: "4px" }}>
                              <button onClick={() => removeRubro(r.id)} style={{ background: "transparent", border: "none", color: "#555", cursor: "pointer", fontSize: "14px" }}>×</button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: "1px solid #2a2a2a" }}>
                        <td style={{ padding: "6px", color: "#888", fontSize: "12px", position: "sticky", left: 0, background: "#050505" }} colSpan={2}>Otros gastos</td>
                        {MONTHS.map((_, i) => (
                          <td key={i} style={{ padding: "3px 2px" }}>
                            <input type="number" value={otrosGastos[i] || ""} onChange={e => updateOtros(i, e.target.value)} placeholder="0" style={{ ...inp, width: "62px", textAlign: "center", fontSize: "12px" }} />
                          </td>
                        ))}
                        <td style={{ padding: "6px", textAlign: "right", fontWeight: "600", color: "#888", fontFamily: "monospace", fontSize: "12px" }}>{fmt(otrosGastos.reduce((a, b) => a + b, 0))}</td>
                        <td></td><td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", gap: "12px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={addRubro} style={btn}>+ Agregar rubro</button>
                {rubros.length > 0 && calcs.totalRubros !== calcs.totalProgramado && (
                  <span style={{ fontSize: "12px", color: "#e8a735" }}>
                    ⚠ Total rubros: {fmtFull(calcs.totalRubros)} — Programado: {fmtFull(calcs.totalProgramado)} (dif: {fmtFull(calcs.totalRubros - calcs.totalProgramado)})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RESUMEN */}
        {activeTab === "resumen" && (
          <div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", fontFamily: "monospace" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #2a2207" }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: "#d4a017", minWidth: "130px", position: "sticky", left: 0, background: "#050505", zIndex: 1 }}>Concepto</th>
                    {MONTHS.map((_, i) => <th key={i} style={{ textAlign: "right", padding: "8px 6px", color: "#888", fontSize: "11px" }}>{SHORT[i]}</th>)}
                    <th style={{ textAlign: "right", padding: "8px 6px", color: "#d4a017" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "#0a0f0a" }}>
                    <td style={{ padding: "6px", color: "#4a9", fontWeight: "600", position: "sticky", left: 0, background: "#0a0f0a", zIndex: 1 }}>Cobranzas</td>
                    {cobranzas.map((c, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: "#4a9" }}>{c > 0 ? fmtFull(c) : "-"}</td>)}
                    <td style={{ textAlign: "right", padding: "6px", color: "#4a9", fontWeight: "700" }}>{fmtFull(cobranzas.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                  {rubros.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #111" }}>
                      <td style={{ padding: "6px", color: "#aaa", position: "sticky", left: 0, background: "#050505", zIndex: 1 }}>{r.nombre}</td>
                      {r.pagos.map((p, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: p > 0 ? "#c55" : "#333" }}>{p > 0 ? fmtFull(p) : "-"}</td>)}
                      <td style={{ textAlign: "right", padding: "6px", color: "#c55", fontWeight: "600" }}>{fmtFull(r.pagos.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  ))}
                  {otrosGastos.some(g => g > 0) && (
                    <tr style={{ borderBottom: "1px solid #111" }}>
                      <td style={{ padding: "6px", color: "#aaa", position: "sticky", left: 0, background: "#050505", zIndex: 1 }}>Otros gastos</td>
                      {otrosGastos.map((g, i) => <td key={i} style={{ textAlign: "right", padding: "6px", color: g > 0 ? "#c55" : "#333" }}>{g > 0 ? fmtFull(g) : "-"}</td>)}
                      <td style={{ textAlign: "right", padding: "6px", color: "#c55", fontWeight: "600" }}>{fmtFull(otrosGastos.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "2px solid #2a2207", background: "#0d0d08" }}>
                    <td style={{ padding: "8px 6px", color: "#d4a017", fontWeight: "700", position: "sticky", left: 0, background: "#0d0d08", zIndex: 1 }}>Flujo neto</td>
                    {MONTHS.map((_, i) => { const n = cobranzas[i] - calcs.egresosPorMes[i]; return <td key={i} style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: n >= 0 ? "#4a9" : "#ff4444" }}>{fmtFull(n)}</td>; })}
                    <td style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: "#d4a017" }}>{fmtFull(cobranzas.reduce((a, b) => a + b, 0) - calcs.totalEgresos)}</td>
                  </tr>
                  <tr style={{ background: "#0d0d08" }}>
                    <td style={{ padding: "8px 6px", color: "#d4a017", fontWeight: "700", position: "sticky", left: 0, background: "#0d0d08", zIndex: 1 }}>Saldo acum.</td>
                    {calcs.flujo.map((v, i) => <td key={i} style={{ textAlign: "right", padding: "8px 6px", fontWeight: "700", color: v >= 0 ? "#d4a017" : "#ff4444" }}>{fmtFull(v)}</td>)}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {calcs.flujo.some(v => v < 0) && (
              <div style={{ marginTop: "16px", padding: "12px 14px", background: "#1a0a0a", border: "1px solid #2a1515", borderRadius: "4px", fontSize: "12px", color: "#ff6666" }}>
                ⚠ Hay meses con saldo negativo. Revisá la distribución de pagos o adelantá cobranzas.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
