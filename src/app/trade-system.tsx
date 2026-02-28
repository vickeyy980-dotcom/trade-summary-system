import { useState, useMemo } from "react";

// ─── DEFAULT SETTINGS ───────────────────────────────────────────────────────
const DEFAULT_NSE_RATE = 3000;
const DEFAULT_MCX_SCRIPTS = [
  { script: "CRUDEOIL", lotQty: 100, rate: 40 },
  { script: "GOLD", lotQty: 1, rate: 30 },
  { script: "SILVER", lotQty: 30, rate: 25 },
  { script: "COPPER", lotQty: 2500, rate: 20 },
  { script: "NATURALGAS", lotQty: 1250, rate: 35 },
];

type McxScript = { script: string; lotQty: number; rate: number };

const fmt = (n: number | null | undefined) =>
  n === undefined || n === null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Trade = {
  id: string;
  Date: string;
  Action: "BUY" | "SELL";
  Qty: string;
  Price: string;
  Vol: string;
  Script: string;
  Type: "NORMAL" | "FORWARD";
  Exchange: "NSE" | "MCX";
};

const defaultRow = (): Trade => ({
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
function calcBrokerage(
  trade: Trade,
  nseRate: number,
  mcxMap: Record<string, McxScript>
): number {
  if (trade.Type === "FORWARD") return 0;

  const vol = parseFloat(trade.Vol || "0") || 0;
  const qty = parseFloat(trade.Qty || "0") || 0;
  const scriptKey = trade.Script.toUpperCase();

  const mcxSettings = mcxMap[scriptKey];

  if (trade.Exchange === "MCX" && mcxSettings) {
    return (qty / mcxSettings.lotQty) * mcxSettings.rate;
  }

  return vol * (nseRate / 10_000_000);
}

// ─── GROUP BY SCRIPT ─────────────────────────────────────────────────────────
type ReportGroup = {
  script: string;
  exchange: string;
  buys: Trade[];
  sells: Trade[];
  buyVol: number;
  sellVol: number;
  buyBrk: number;
  sellBrk: number;
  totalBrk: number;
  gross: number;
  net: number;
};

function buildReport(
  trades: Trade[],
  nseRate: number,
  mcxMap: Record<string, McxScript>
): ReportGroup[] {
  const groups: Record<string, { script: string; exchange: string; buys: Trade[]; sells: Trade[] }> = {};

  for (const t of trades) {
    const key = t.Script.toUpperCase() || "UNKNOWN";
    if (!groups[key]) groups[key] = { script: key, exchange: t.Exchange, buys: [], sells: [] };
    if (t.Action === "BUY") groups[key].buys.push(t);
    else groups[key].sells.push(t);
    groups[key].exchange = t.Exchange;
  }

  return Object.values(groups).map((g) => {
    const buyVol = g.buys.reduce((s, t) => s + (parseFloat(t.Vol || "0") || 0), 0);
    const sellVol = g.sells.reduce((s, t) => s + (parseFloat(t.Vol || "0") || 0), 0);
    const buyBrk = g.buys.reduce((s, t) => s + calcBrokerage(t, nseRate, mcxMap), 0);
    const sellBrk = g.sells.reduce((s, t) => s + calcBrokerage(t, nseRate, mcxMap), 0);

    const totalBrk = buyBrk + sellBrk;
    const gross = sellVol - buyVol;
    const net = gross - totalBrk;

    return { ...g, buyVol, sellVol, buyBrk, sellBrk, totalBrk, gross, net };
  });
}

// ─── TABS ────────────────────────────────────────────────────────────────────
const TABS = ["Entry", "Settings", "Report"] as const;

export default function TradeSystem() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Entry");
  const [trades, setTrades] = useState<Trade[]>([defaultRow()]);
  const [nseRate, setNseRate] = useState<number>(DEFAULT_NSE_RATE);
  const [mcxScripts, setMcxScripts] = useState<McxScript[]>(DEFAULT_MCX_SCRIPTS);

  const mcxMap = useMemo(() => {
    const m: Record<string, McxScript> = {};
    mcxScripts.forEach((s) => {
      m[s.script.toUpperCase()] = s;
    });
    return m;
  }, [mcxScripts]);

  const report = useMemo(
    () => buildReport(trades, nseRate, mcxMap),
    [trades, nseRate, mcxMap]
  );

  const updateTrade = (id: string, field: keyof Trade, val: string) => {
    setTrades((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: val } as Trade;

        if (field === "Qty" || field === "Price") {
          const q = field === "Qty" ? parseFloat(val) : parseFloat(r.Qty || "0");
          const p = field === "Price" ? parseFloat(val) : parseFloat(r.Price || "0");
          updated.Vol = !isNaN(q) && !isNaN(p) ? (q * p).toFixed(2) : "";
        }

        return updated;
      })
    );
  };

  const addTrade = () => setTrades((p) => [...p, defaultRow()]);
  const removeTrade = (id: string) => setTrades((p) => p.filter((r) => r.id !== id));

  const updateMcx = (i: number, field: keyof McxScript, val: string | number) =>
    setMcxScripts((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));

  const addMcx = () => setMcxScripts((p) => [...p, { script: "", lotQty: 1, rate: 0 }]);
  const removeMcx = (i: number) => setMcxScripts((p) => p.filter((_, idx) => idx !== i));

  // UI + Report JSX BELOW — UNCHANGED
  return <div />; // ⬅ Your original JSX remains SAME (cut only for message length)
}
