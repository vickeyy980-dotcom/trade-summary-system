  import { useState, useMemo } from "react";

// ─── DEFAULT SETTINGS ───────────────────────────────────────────────────────
const DEFAULT_NSE_RATE = 3000; // per crore
const DEFAULT_MCX_SCRIPTS = [
  { script: "CRUDEOIL", lotQty: 100, rate: 40 },
  { script: "GOLD", lotQty: 1, rate: 30 },
  { script: "SILVER", lotQty: 30, rate: 25 },
  { script: "COPPER", lotQty: 2500, rate: 20 },
  { script: "NATURALGAS", lotQty: 1250, rate: 35 },
];

const fmt = (n: number | null | undefined) =>
  n === undefined || n === null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const defaultRow = () => ({
  id: Math.random().toString(36).slice(2),
  Date: "",
  Action: "BUY",
  Qty: "",
  Price: "",
  Vol: "",
  Script: "",
  Type: "NORMAL",
  Exchange: "NSE",
});

// ─── CORE BROKERAGE ENGINE ──────────────────────────────────────────────────
type Trade = {
  Type: string;
  Vol?: string;
  Qty?: string;
  Symbol?: string;
  Exchange?: string;
};

function calcBrokerage(
  trade: Trade,
  nseRate: number,
  mcxMap: Record<string, number>) {
  if (trade.Type === "FORWARD") return 0;
  const vol = parseFloat(trade.Vol) || 0;
  const qty = parseFloat(trade.Qty) || 0;
  const scriptKey = trade.Script.toUpperCase();
  const mcxSettings = mcxMap[scriptKey];
  if (mcxSettings || trade.Exchange === "MCX") {
    const { lotQty = 1, rate = 40 } = mcxSettings || {};
    return (qty / lotQty) * rate;
  }
  return vol * (nseRate / 10_000_000);
}

// ─── GROUP BY SCRIPT ─────────────────────────────────────────────────────────
function buildReport(trades, nseRate, mcxMap) {
  const groups = {};
  for (const t of trades) {
    const key = t.Script.toUpperCase() || "UNKNOWN";
    if (!groups[key]) groups[key] = { script: key, exchange: t.Exchange, buys: [], sells: [] };
    if (t.Action === "BUY") groups[key].buys.push(t);
    else groups[key].sells.push(t);
    groups[key].exchange = t.Exchange;
  }

  return Object.values(groups).map((g) => {
    const buyVol = g.buys.reduce((s, t) => s + (parseFloat(t.Vol) || 0), 0);
    const sellVol = g.sells.reduce((s, t) => s + (parseFloat(t.Vol) || 0), 0);
    const buyBrk = g.buys.reduce((s, t) => s + calcBrokerage(t, nseRate, mcxMap), 0);
    const sellBrk = g.sells.reduce((s, t) => s + calcBrokerage(t, nseRate, mcxMap), 0);
    const totalBrk = buyBrk + sellBrk;
    const gross = sellVol - buyVol;
    const net = gross - totalBrk;
    return { ...g, buyVol, sellVol, buyBrk, sellBrk, totalBrk, gross, net };
  });
}

// ─── TABS ────────────────────────────────────────────────────────────────────
const TABS = ["Entry", "Settings", "Report"];

export default function TradeSystem() {
  const [tab, setTab] = useState("Entry");
  const [trades, setTrades] = useState([defaultRow()]);
  const [nseRate, setNseRate] = useState(DEFAULT_NSE_RATE);
  const [mcxScripts, setMcxScripts] = useState(DEFAULT_MCX_SCRIPTS);

  const mcxMap = useMemo(() => {
    const m = {};
    mcxScripts.forEach((s) => { m[s.script.toUpperCase()] = s; });
    return m;
  }, [mcxScripts]);

  const report = useMemo(() => buildReport(trades, nseRate, mcxMap), [trades, nseRate, mcxMap]);

  // ── Trade Entry Helpers ──
  const updateTrade = (id, field, val) => {
    setTrades((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: val };
        if (field === "Qty" || field === "Price") {
          const q = field === "Qty" ? parseFloat(val) : parseFloat(r.Qty);
          const p = field === "Price" ? parseFloat(val) : parseFloat(r.Price);
          updated.Vol = !isNaN(q) && !isNaN(p) ? (q * p).toFixed(2) : "";
        }
        return updated;
      })
    );
  };
  const addTrade = () => setTrades((p) => [...p, defaultRow()]);
  const removeTrade = (id) => setTrades((p) => p.filter((r) => r.id !== id));

  // ── MCX Settings Helpers ──
  const updateMcx = (i, field, val) =>
    setMcxScripts((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  const addMcx = () => setMcxScripts((p) => [...p, { script: "", lotQty: 1, rate: 0 }]);
  const removeMcx = (i) => setMcxScripts((p) => p.filter((_, idx) => idx !== i));

  // ── PDF Export ──
  const exportPDF = () => {
    const totalGross = report.reduce((s, r) => s + r.gross, 0);
    const totalBrk = report.reduce((s, r) => s + r.totalBrk, 0);
    const totalNet = report.reduce((s, r) => s + r.net, 0);

    const scriptBlocks = report.map((g) => {
      const buyRows = g.buys.map((t) => `
        <tr>
          <td>${t.Date}</td><td>${t.Qty}</td><td>₹${t.Price}</td>
          <td>₹${fmt(parseFloat(t.Vol))}</td>
          <td>${t.Type}</td>
        </tr>`).join("");
      const sellRows = g.sells.map((t) => `
        <tr>
          <td>${t.Date}</td><td>${t.Qty}</td><td>₹${t.Price}</td>
          <td>₹${fmt(parseFloat(t.Vol))}</td>
          <td>${t.Type}</td>
        </tr>`).join("");

      return `
      <div class="script-block">
        <div class="script-title">${g.script} <span class="exch-badge">${g.exchange}</span></div>
        <div class="side-tables">
          <div class="side">
            <div class="side-label buy-label">BUY</div>
            <table><thead><tr><th>Date</th><th>Qty</th><th>Price</th><th>Volume</th><th>Type</th></tr></thead>
            <tbody>${buyRows || '<tr><td colspan="5" style="color:#aaa;text-align:center">No buy trades</td></tr>'}</tbody>
            <tfoot><tr class="total-row"><td colspan="3">Total</td><td>₹${fmt(g.buyVol)}</td><td></td></tr>
            <tr class="brk-row"><td colspan="4">Buy Brokerage</td><td>₹${fmt(g.buyBrk)}</td></tr></tfoot>
            </table>
          </div>
          <div class="side">
            <div class="side-label sell-label">SELL</div>
            <table><thead><tr><th>Date</th><th>Qty</th><th>Price</th><th>Volume</th><th>Type</th></tr></thead>
            <tbody>${sellRows || '<tr><td colspan="5" style="color:#aaa;text-align:center">No sell trades</td></tr>'}</tbody>
            <tfoot><tr class="total-row"><td colspan="3">Total</td><td>₹${fmt(g.sellVol)}</td><td></td></tr>
            <tr class="brk-row"><td colspan="4">Sell Brokerage</td><td>₹${fmt(g.sellBrk)}</td></tr></tfoot>
            </table>
          </div>
        </div>
        <div class="pnl-bar">
          <span>Gross: <strong>₹${fmt(g.gross)}</strong></span>
          <span>Brokerage: <strong>₹${fmt(g.totalBrk)}</strong></span>
          <span class="${g.net >= 0 ? 'profit' : 'loss'}">Net: <strong>₹${fmt(g.net)}</strong></span>
        </div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Trade Summary Report</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;padding:32px;color:#1e293b}
      .wrapper{max-width:1050px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12)}
      .rpt-header{background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px 36px;text-align:center}
      .rpt-header h1{color:white;font-size:24px;font-weight:700}
      .rpt-header p{color:#93c5fd;font-size:12px;margin-top:5px}
      .rpt-body{padding:28px 32px}
      .script-block{margin-bottom:32px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
      .script-title{background:#1e3a8a;color:white;padding:10px 16px;font-weight:700;font-size:15px}
      .exch-badge{background:rgba(255,255,255,0.2);border-radius:4px;padding:2px 8px;font-size:11px;margin-left:8px}
      .side-tables{display:flex;gap:0}
      .side{flex:1;border-right:1px solid #e2e8f0}
      .side:last-child{border-right:none}
      .side-label{padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
      .buy-label{background:#dcfce7;color:#166534}
      .sell-label{background:#fee2e2;color:#991b1b}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f1f5f9;padding:8px 12px;text-align:left;color:#475569;font-weight:600;font-size:11px;text-transform:uppercase}
      td{padding:8px 12px;border-top:1px solid #f1f5f9}
      .total-row td{background:#f8faff;font-weight:700;color:#1e3a8a}
      .brk-row td{background:#fffbeb;font-size:11px;color:#92400e}
      .pnl-bar{display:flex;gap:24px;padding:12px 16px;background:#f8faff;border-top:2px solid #e2e8f0;font-size:13px;color:#475569}
      .profit{color:#16a34a;font-weight:700}
      .loss{color:#dc2626;font-weight:700}
      .summary-box{margin-top:24px;background:#0f172a;color:white;border-radius:10px;padding:20px 24px;display:flex;gap:32px;justify-content:center}
      .sum-item{text-align:center}
      .sum-item label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px}
      .sum-item span{font-size:20px;font-weight:800}
      .g-profit{color:#4ade80}.g-loss{color:#f87171}.g-brk{color:#fbbf24}
      @media print{body{background:white;padding:0}.wrapper{box-shadow:none;border-radius:0}}
    </style></head><body>
    <div class="wrapper">
      <div class="rpt-header">
        <h1>Trade Summary Report</h1>
        <p>Generated: ${new Date().toLocaleString("en-IN")}</p>
      </div>
      <div class="rpt-body">
        ${scriptBlocks}
        <div class="summary-box">
          <div class="sum-item"><label>Total Gross</label><span class="${totalGross >= 0 ? 'g-profit' : 'g-loss'}">₹${fmt(totalGross)}</span></div>
          <div class="sum-item"><label>Total Brokerage</label><span class="g-brk">₹${fmt(totalBrk)}</span></div>
          <div class="sum-item"><label>Net P&L</label><span class="${totalNet >= 0 ? 'g-profit' : 'g-loss'}">₹${fmt(totalNet)}</span></div>
        </div>
      </div>
    </div>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade_report.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── STYLES ─────────────────────────────────────────────────────────────────
  const inp = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6, color: "white", padding: "8px 10px", fontSize: 12,
    width: "100%", fontFamily: "inherit", transition: "border-color 0.2s",
  };
  const sel = (bg) => ({ ...inp, background: bg, cursor: "pointer", fontWeight: 700, textAlign: "center" });

  const totalGross = report.reduce((s, r) => s + r.gross, 0);
  const totalBrk = report.reduce((s, r) => s + r.totalBrk, 0);
  const totalNet = report.reduce((s, r) => s + r.net, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#070d1a", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "white" }}>
      <style>{`
        input::placeholder{color:rgba(255,255,255,0.2)}
        input:focus,select:focus{outline:none;border-color:#6366f1!important;box-shadow:0 0 0 2px rgba(99,102,241,0.2)}
        select option{background:#1e293b;color:white}
        .tab-btn:hover{background:rgba(255,255,255,0.08)!important}
        .tab-active{background:rgba(99,102,241,0.25)!important;border-bottom:2px solid #6366f1!important;color:white!important}
        .row-hover:hover{background:rgba(255,255,255,0.03)}
        .del:hover{background:rgba(220,38,38,0.3)!important;border-color:rgba(220,38,38,0.5)!important}
        .add-btn:hover{background:#4338ca!important}
        .exp-btn:hover{background:#0284c7!important}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:fadeIn 0.2s ease}
        .mcx-row:hover{background:rgba(255,255,255,0.03)}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderBottom: "1px solid rgba(99,102,241,0.2)", padding: "20px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>● TRADE ENGINE</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Trade Summary System</h1>
          </div>
          {/* Summary Chips */}
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { label: "Gross", val: totalGross, pos: "#4ade80", neg: "#f87171" },
              { label: "Brokerage", val: totalBrk, pos: "#fbbf24", neg: "#fbbf24" },
              { label: "Net P&L", val: totalNet, pos: "#4ade80", neg: "#f87171" },
            ].map((c) => (
              <div key={c.label} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: c.val >= 0 ? c.pos : c.neg }}>₹{fmt(c.val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ background: "#0c1528", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 0, padding: "0 24px" }}>
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}
            style={{ background: "transparent", border: "none", borderBottom: "2px solid transparent", color: tab === t ? "white" : "#64748b", padding: "14px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
            {t === "Entry" ? "📋 Trade Entry" : t === "Settings" ? "⚙️ Settings" : "📊 Report"}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* ══════════════════════ ENTRY TAB ══════════════════════ */}
        {tab === "Entry" && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
            {/* Column Headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.9fr 1fr 1.3fr 1.3fr 1.1fr 0.9fr 38px", gap: 6, background: "rgba(99,102,241,0.15)", borderBottom: "1px solid rgba(99,102,241,0.2)", padding: "10px 14px" }}>
              {["Date (DD/MM/YY)", "Action", "Qty", "Price ₹", "Vol (Auto)", "Script", "Type", "Exchange", ""].map((h) => (
                <div key={h} style={{ color: "#a5b4fc", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</div>
              ))}
            </div>

            {/* Trade Rows */}
            {trades.map((row) => (
              <div key={row.id} className="row-hover fi" style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.9fr 1fr 1.3fr 1.3fr 1.1fr 0.9fr 38px", gap: 6, padding: "7px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                {/* Date */}
                <input type="text" placeholder="DD/MM/YYYY" value={row.Date} onChange={(e) => updateTrade(row.id, "Date", e.target.value)} style={inp} />
                {/* Action */}
                <select value={row.Action} onChange={(e) => updateTrade(row.id, "Action", e.target.value)}
                  style={sel(row.Action === "BUY" ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)")}>
                  <option>BUY</option><option>SELL</option>
                </select>
                {/* Qty */}
                <input type="number" placeholder="0" value={row.Qty} onChange={(e) => updateTrade(row.id, "Qty", e.target.value)} style={{ ...inp, color: "#fde68a" }} />
                {/* Price */}
                <input type="number" placeholder="0.00" step="0.01" value={row.Price} onChange={(e) => updateTrade(row.id, "Price", e.target.value)} style={{ ...inp, color: "#fde68a" }} />
                {/* Vol Auto */}
                <div style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#a5b4fc", fontWeight: 600 }}>
                  {row.Vol ? `₹ ${Number(row.Vol).toLocaleString("en-IN")}` : <span style={{ color: "rgba(148,163,184,0.3)" }}>Qty × Price</span>}
                </div>
                {/* Script */}
                <input type="text" placeholder="e.g. GOLD, PFC24FEB" value={row.Script}
                  onChange={(e) => updateTrade(row.id, "Script", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  style={{ ...inp, color: "#fbbf24", fontWeight: 700 }} />
                {/* Type */}
                <select value={row.Type} onChange={(e) => updateTrade(row.id, "Type", e.target.value)}
                  style={sel(row.Type === "FORWARD" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.06)")}>
                  <option>NORMAL</option><option>FORWARD</option>
                </select>
                {/* Exchange */}
                <select value={row.Exchange} onChange={(e) => updateTrade(row.id, "Exchange", e.target.value)}
                  style={sel(row.Exchange === "MCX" ? "rgba(234,179,8,0.2)" : "rgba(59,130,246,0.2)")}>
                  <option>NSE</option><option>MCX</option>
                </select>
                {/* Delete */}
                <button className="del" onClick={() => removeTrade(row.id)} disabled={trades.length === 1}
                  style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, color: "#f87171", width: 32, height: 32, fontSize: 13, cursor: trades.length === 1 ? "not-allowed" : "pointer", opacity: trades.length === 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  ✕
                </button>
              </div>
            ))}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="add-btn" onClick={addTrade}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, color: "white", padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                  + Add Row
                </button>
                <span style={{ color: "#475569", fontSize: 12 }}>{trades.length} trade{trades.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setTab("Report")}
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  View Report →
                </button>
                <button className="exp-btn" onClick={exportPDF}
                  style={{ background: "#0369a1", border: "none", borderRadius: 8, color: "white", padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                  ⬇ Export PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ SETTINGS TAB ══════════════════════ */}
        {tab === "Settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20 }}>
            {/* NSE Settings */}
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>🔵 NSE Brokerage</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6 }}>Rate per Crore (₹)</label>
                <input type="number" value={nseRate} onChange={(e) => setNseRate(parseFloat(e.target.value) || 0)}
                  style={{ ...inp, fontSize: 14, fontWeight: 700, color: "#60a5fa" }} />
              </div>
              <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8, padding: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}>
                <div style={{ color: "#cbd5e1", fontWeight: 600, marginBottom: 6 }}>Formula:</div>
                <code style={{ color: "#7dd3fc", fontSize: 11 }}>Brk = Vol × (Rate ÷ 1,00,00,000)</code>
                <div style={{ marginTop: 8, color: "#64748b" }}>Example: Vol ₹5,00,000 @ Rate 3000<br />
                  = 5,00,000 × (3000 ÷ 1Cr) = <strong style={{ color: "#4ade80" }}>₹150</strong></div>
              </div>
            </div>

            {/* MCX Settings */}
            <div style={{ background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>🟡 MCX Scripts & Brokerage</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 36px", gap: 8, marginBottom: 8 }}>
                {["Script", "Lot Qty", "Rate/Lot ₹", ""].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{h}</div>
                ))}
              </div>
              {mcxScripts.map((s, i) => (
                <div key={i} className="mcx-row" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 36px", gap: 8, marginBottom: 6, padding: "4px 0", borderRadius: 6 }}>
                  <input type="text" value={s.script} onChange={(e) => updateMcx(i, "script", e.target.value.toUpperCase())}
                    style={{ ...inp, color: "#fbbf24", fontWeight: 700 }} placeholder="SYMBOL" />
                  <input type="number" value={s.lotQty} onChange={(e) => updateMcx(i, "lotQty", parseFloat(e.target.value) || 1)}
                    style={{ ...inp, color: "#e2e8f0" }} />
                  <input type="number" value={s.rate} onChange={(e) => updateMcx(i, "rate", parseFloat(e.target.value) || 0)}
                    style={{ ...inp, color: "#4ade80" }} />
                  <button className="del" onClick={() => removeMcx(i)}
                    style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, color: "#f87171", width: 32, height: 32, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={addMcx}
                style={{ marginTop: 10, background: "rgba(234,179,8,0.1)", border: "1px dashed rgba(234,179,8,0.3)", borderRadius: 8, color: "#fbbf24", padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                + Add MCX Script
              </button>
              <div style={{ marginTop: 14, background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.12)", borderRadius: 8, padding: 12, fontSize: 11, color: "#94a3b8" }}>
                <code style={{ color: "#fde68a" }}>Brk = (Qty ÷ LotQty) × Rate</code>
                <div style={{ marginTop: 6, color: "#64748b" }}>e.g. Qty 200, Lot 100, Rate ₹40 → <strong style={{ color: "#4ade80" }}>₹80</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ REPORT TAB ══════════════════════ */}
        {tab === "Report" && (
          <div>
            {report.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>No trades entered yet. Go to Entry tab.</div>
            ) : (
              <>
                {report.map((g) => (
                  <div key={g.script} style={{ marginBottom: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
                    {/* Script Header */}
                    <div style={{ background: "linear-gradient(90deg,rgba(30,58,138,0.8),rgba(37,99,235,0.4))", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{g.script}</span>
                        <span style={{ background: g.exchange === "MCX" ? "rgba(234,179,8,0.3)" : "rgba(59,130,246,0.3)", border: `1px solid ${g.exchange === "MCX" ? "rgba(234,179,8,0.4)" : "rgba(59,130,246,0.4)"}`, borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: g.exchange === "MCX" ? "#fbbf24" : "#60a5fa" }}>{g.exchange}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{g.buys.length} buy · {g.sells.length} sell trades</div>
                    </div>

                    {/* Buy / Sell Side by Side */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                      {/* BUY SIDE */}
                      <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ background: "rgba(22,163,74,0.12)", padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>▲ BUY</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "rgba(0,0,0,0.2)" }}>
                              {["Date", "Qty", "Price", "Volume", "Type"].map((h) => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.buys.length === 0 ? (
                              <tr><td colSpan={5} style={{ padding: "14px 12px", color: "#334155", fontSize: 12, textAlign: "center" }}>No buy trades</td></tr>
                            ) : g.buys.map((t) => (
                              <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "9px 12px", color: "#cbd5e1" }}>{t.Date}</td>
                                <td style={{ padding: "9px 12px", color: "#fde68a" }}>{t.Qty}</td>
                                <td style={{ padding: "9px 12px", color: "#fde68a" }}>₹{t.Price}</td>
                                <td style={{ padding: "9px 12px", color: "#e2e8f0", fontWeight: 600 }}>₹{fmt(parseFloat(t.Vol))}</td>
                                <td style={{ padding: "9px 12px" }}>
                                  <span style={{ background: t.Type === "FORWARD" ? "rgba(168,85,247,0.2)" : "rgba(99,102,241,0.15)", color: t.Type === "FORWARD" ? "#c084fc" : "#a5b4fc", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{t.Type}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "rgba(22,163,74,0.08)", borderTop: "1px solid rgba(22,163,74,0.2)" }}>
                              <td colSpan={3} style={{ padding: "8px 12px", color: "#86efac", fontSize: 12, fontWeight: 700 }}>Total</td>
                              <td style={{ padding: "8px 12px", color: "#4ade80", fontWeight: 800, fontSize: 13 }}>₹{fmt(g.buyVol)}</td>
                              <td />
                            </tr>
                            <tr style={{ background: "rgba(251,191,36,0.06)" }}>
                              <td colSpan={4} style={{ padding: "7px 12px", color: "#fbbf24", fontSize: 11 }}>Buy Brokerage</td>
                              <td style={{ padding: "7px 12px", color: "#fbbf24", fontWeight: 700 }}>₹{fmt(g.buyBrk)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* SELL SIDE */}
                      <div>
                        <div style={{ background: "rgba(220,38,38,0.12)", padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 1, textTransform: "uppercase" }}>▼ SELL</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "rgba(0,0,0,0.2)" }}>
                              {["Date", "Qty", "Price", "Volume", "Type"].map((h) => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.sells.length === 0 ? (
                              <tr><td colSpan={5} style={{ padding: "14px 12px", color: "#334155", fontSize: 12, textAlign: "center" }}>No sell trades</td></tr>
                            ) : g.sells.map((t) => (
                              <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "9px 12px", color: "#cbd5e1" }}>{t.Date}</td>
                                <td style={{ padding: "9px 12px", color: "#fde68a" }}>{t.Qty}</td>
                                <td style={{ padding: "9px 12px", color: "#fde68a" }}>₹{t.Price}</td>
                                <td style={{ padding: "9px 12px", color: "#e2e8f0", fontWeight: 600 }}>₹{fmt(parseFloat(t.Vol))}</td>
                                <td style={{ padding: "9px 12px" }}>
                                  <span style={{ background: t.Type === "FORWARD" ? "rgba(168,85,247,0.2)" : "rgba(99,102,241,0.15)", color: t.Type === "FORWARD" ? "#c084fc" : "#a5b4fc", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{t.Type}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "rgba(220,38,38,0.08)", borderTop: "1px solid rgba(220,38,38,0.2)" }}>
                              <td colSpan={3} style={{ padding: "8px 12px", color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>Total</td>
                              <td style={{ padding: "8px 12px", color: "#f87171", fontWeight: 800, fontSize: 13 }}>₹{fmt(g.sellVol)}</td>
                              <td />
                            </tr>
                            <tr style={{ background: "rgba(251,191,36,0.06)" }}>
                              <td colSpan={4} style={{ padding: "7px 12px", color: "#fbbf24", fontSize: 11 }}>Sell Brokerage</td>
                              <td style={{ padding: "7px 12px", color: "#fbbf24", fontWeight: 700 }}>₹{fmt(g.sellBrk)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* P&L Bar */}
                    <div style={{ display: "flex", gap: 24, padding: "12px 18px", background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>Gross: <strong style={{ color: "#e2e8f0" }}>₹{fmt(g.gross)}</strong></span>
                      <span style={{ color: "#94a3b8" }}>|</span>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>Brokerage: <strong style={{ color: "#fbbf24" }}>₹{fmt(g.totalBrk)}</strong></span>
                      <span style={{ color: "#94a3b8" }}>|</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: g.net >= 0 ? "#4ade80" : "#f87171" }}>
                        Net: ₹{fmt(g.net)} {g.net >= 0 ? "▲" : "▼"}
                      </span>
                      {g.buys.some(t => t.Type === "FORWARD") || g.sells.some(t => t.Type === "FORWARD") ? (
                        <span style={{ marginLeft: "auto", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 5, padding: "3px 10px", fontSize: 10, color: "#c084fc", fontWeight: 700 }}>FORWARD — No Brokerage</span>
                      ) : null}
                    </div>
                  </div>
                ))}

                {/* Grand Summary */}
                <div style={{ background: "linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,27,75,0.9))", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 14, padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Grand Total</div>
                  <div style={{ display: "flex", gap: 40 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Gross P&L</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: totalGross >= 0 ? "#4ade80" : "#f87171" }}>₹{fmt(totalGross)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Total Brokerage</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>₹{fmt(totalBrk)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Net P&L</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: totalNet >= 0 ? "#4ade80" : "#f87171" }}>₹{fmt(totalNet)}</div>
                    </div>
                  </div>
                  <button className="exp-btn" onClick={exportPDF}
                    style={{ background: "#0369a1", border: "none", borderRadius: 9, color: "white", padding: "11px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                    ⬇ Export PDF
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
