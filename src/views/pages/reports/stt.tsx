// pages/reports/SalesToTradeReportPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  TrendingUp,
  BarChart3,
  Layers,
  Grid,
  Users,
} from "lucide-react";
import { supabase } from "@/config/db";

interface STTItem {
  item_code: string;
  item_description: string;
  qty: number;
  uom: string;
}

interface STTRawRecord {
  id: string;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  user_id: string;
  tbl_stt_items: STTItem[];
}

export default function SalesToTradeReportPage() {
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<STTRawRecord[]>([]);

  // Tab controllers for dynamic card toggles
  const [qtyTimeframe, setQtyTimeframe] = useState<"today" | "week" | "month">(
    "month",
  );
  const [distTimeframe, setDistTimeframe] = useState<
    "today" | "week" | "month"
  >("month");

  useEffect(() => {
    async function fetchReportData() {
      if (!currentCompanyId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase()
          .from("tbl_stt")
          .select(
            `
            id,
            created_at,
            outlet_name,
            bp_code,
            user_id,
            tbl_stt_items (
              item_code,
              item_description,
              qty,
              uom
            )
          `,
          )
          .eq("company_id", currentCompanyId);

        if (error) throw error;
        setRawData((data as unknown as STTRawRecord[]) || []);
      } catch (err: any) {
        toast.error(err.message || "Failed loading Sales-to-Trade metrics");
      } finally {
        setIsLoading(false);
      }
    }
    fetchReportData();
  }, [currentCompanyId]);

  // --- Dynamic Date Filtering Matrices ---
  const dateFilters = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).getTime();

    return {
      today: (dStr: string) => new Date(dStr).getTime() >= startOfToday,
      week: (dStr: string) => new Date(dStr).getTime() >= startOfWeek.getTime(),
      month: (dStr: string) => new Date(dStr).getTime() >= startOfMonth,
    };
  }, []);

  // --- 1. Total Quantities Matrix ---
  const totalQuantities = useMemo(() => {
    let today = 0,
      week = 0,
      month = 0;
    rawData.forEach((rec) => {
      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;
      if (dateFilters.today(rec.created_at)) today += itemSum;
      if (dateFilters.week(rec.created_at)) week += itemSum;
      if (dateFilters.month(rec.created_at)) month += itemSum;
    });
    return { today, week, month };
  }, [rawData, dateFilters]);

  // --- 2. Distributor Calculations ---
  const distributorSales = useMemo(() => {
    const counts: Record<
      string,
      { name: string; today: number; week: number; month: number }
    > = {};
    rawData.forEach((rec) => {
      const bp = rec.bp_code || "Unknown Dist";
      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;

      if (!counts[bp])
        counts[bp] = {
          name: rec.outlet_name || bp,
          today: 0,
          week: 0,
          month: 0,
        };
      if (dateFilters.today(rec.created_at)) counts[bp].today += itemSum;
      if (dateFilters.week(rec.created_at)) counts[bp].week += itemSum;
      if (dateFilters.month(rec.created_at)) counts[bp].month += itemSum;
    });
    return Object.values(counts).sort((a, b) => b.month - a.month);
  }, [rawData, dateFilters]);

  // --- 3. Top Sales Agents Ranking ---
  const topAgents = useMemo(() => {
    const agents: Record<string, number> = {};
    rawData.forEach((rec) => {
      const agent = rec.user_id || "System Agent";
      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;
      agents[agent] = (agents[agent] || 0) + itemSum;
    });
    return Object.entries(agents)
      .map(([id, volume]) => ({ id, volume }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
  }, [rawData]);

  // --- 4. Top Selling SKU Listing ---
  const topSellingSKUs = useMemo(() => {
    const skus: Record<string, { desc: string; volume: number }> = {};
    rawData.forEach((rec) => {
      rec.tbl_stt_items?.forEach((item) => {
        if (!skus[item.item_code])
          skus[item.item_code] = { desc: item.item_description, volume: 0 };
        skus[item.item_code].volume += Number(item.qty) || 0;
      });
    });
    return Object.entries(skus)
      .map(([code, meta]) => ({ code, ...meta }))
      .sort((a, b) => b.volume - a.volume);
  }, [rawData]);

  // --- 5. Daily Sales Trends (Linear Timeline Arrays) ---
  const dailyTrends = useMemo(() => {
    const totalTrend: Record<string, number> = {};
    const skuTrend: Record<string, Record<string, number>> = {};

    // Get unique sorted dates over last 7 entries
    rawData
      .slice()
      .reverse()
      .forEach((rec) => {
        const dateKey = new Date(rec.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        rec.tbl_stt_items?.forEach((item) => {
          const qty = Number(item.qty) || 0;
          totalTrend[dateKey] = (totalTrend[dateKey] || 0) + qty;

          if (!skuTrend[item.item_code]) skuTrend[item.item_code] = {};
          skuTrend[item.item_code][dateKey] =
            (skuTrend[item.item_code][dateKey] || 0) + qty;
        });
      });

    return { totalTrend: Object.entries(totalTrend), skuTrend };
  }, [rawData]);

  // --- 6. Heatmap Engine Computations (Distributor x SKU) ---
  const heatmapData = useMemo(() => {
    const cellMatrix: Record<string, Record<string, number>> = {};
    const uniqueSKUs = new Set<string>();
    const uniqueDists = new Set<string>();

    rawData.forEach((rec) => {
      const dist = rec.outlet_name || rec.bp_code;
      uniqueDists.add(dist);

      rec.tbl_stt_items?.forEach((item) => {
        uniqueSKUs.add(item.item_code);
        if (!cellMatrix[dist]) cellMatrix[dist] = {};
        cellMatrix[dist][item.item_code] =
          (cellMatrix[dist][item.item_code] || 0) + Number(item.qty);
      });
    });

    return {
      matrix: cellMatrix,
      skus: Array.from(uniqueSKUs).slice(0, 6), // Cap for viewport safety
      distributors: Array.from(uniqueDists).slice(0, 6),
    };
  }, [rawData]);

  // --- 7. Matrix Engine Computations (Agent x Distributor) ---
  const agentDistMatrix = useMemo(() => {
    const cellMatrix: Record<string, Record<string, number>> = {};
    const uniqueAgents = new Set<string>();
    const uniqueDists = new Set<string>();

    rawData.forEach((rec) => {
      const agent = rec.user_id.substring(0, 8) || "Agent";
      const dist = rec.outlet_name || rec.bp_code;

      uniqueAgents.add(agent);
      uniqueDists.add(dist);

      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;
      if (!cellMatrix[agent]) cellMatrix[agent] = {};
      cellMatrix[agent][dist] = (cellMatrix[agent][dist] || 0) + itemSum;
    });

    return {
      matrix: cellMatrix,
      agents: Array.from(uniqueAgents).slice(0, 5),
      distributors: Array.from(uniqueDists).slice(0, 5),
    };
  }, [rawData]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Compiling transaction aggregates...</span>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6 bg-slate-50/50 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Sales to Trade Analytical Dashboard
        </h1>
        <p className="text-xs text-muted-foreground">
          Real-time throughput metrics, cross-matrix matrices, and product
          variant trends.
        </p>
      </div>

      {/* --- SECTION 1: KPIS AND VOLUMETRIC METRICS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Sales Quantity Card */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BarChart3 className="h-4 w-4 text-blue-500" /> Total Sales Volume
            </div>
            <div className="bg-muted text-[10px] rounded-md p-0.5 flex font-mono">
              {(["today", "week", "month"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setQtyTimeframe(t)}
                  className={`px-2 py-0.5 capitalize rounded ${qtyTimeframe === t ? "bg-background shadow-xs font-bold text-primary" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-slate-900">
            {totalQuantities[qtyTimeframe].toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              Units
            </span>
          </div>
        </div>

        {/* Top Selling SKU Mini-Panel */}
        <div className="bg-card p-4 rounded-xl border space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-4 w-4 text-orange-500" /> Top Selling Variant
          </div>
          {topSellingSKUs[0] ? (
            <div>
              <div className="text-xl font-bold truncate text-slate-800">
                {topSellingSKUs[0].desc}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                Code: {topSellingSKUs[0].code} (
                {topSellingSKUs[0].volume.toLocaleString()} units)
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground pt-2">
              No historical ledger entries available.
            </div>
          )}
        </div>

        {/* Lead Sales Agent Ranking */}
        <div className="bg-card p-4 rounded-xl border space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4 text-emerald-500" /> Top Performing Agent
          </div>
          {topAgents[0] ? (
            <div>
              <div className="text-xl font-bold text-slate-800 font-mono">
                ID: {topAgents[0].id}
              </div>
              <div className="text-xs text-muted-foreground">
                Aggregated Output Volume:{" "}
                <span className="font-bold text-emerald-600">
                  {topAgents[0].volume.toLocaleString()}
                </span>{" "}
                units
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground pt-2">
              No agent matrices computed.
            </div>
          )}
        </div>
      </div>

      {/* --- SECTION 2: VOLUME BY DISTRIBUTOR & RANKINGS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sales by Distributor List */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Sales via Distributors
            </h2>
            <div className="bg-muted text-[10px] rounded-md p-0.5 flex font-mono">
              {(["today", "week", "month"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDistTimeframe(t)}
                  className={`px-2 py-0.5 capitalize rounded ${distTimeframe === t ? "bg-background shadow-xs font-bold text-primary" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {distributorSales.map((d, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center text-xs p-1.5 hover:bg-slate-50 rounded"
              >
                <span className="font-medium text-slate-700 truncate max-w-[240px]">
                  {d.name}
                </span>
                <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">
                  {d[distTimeframe].toLocaleString()} pcs
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* SKU Volume Ledger Top List */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="border-b pb-2">
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              SKU Sales Velocity Ranks
            </h2>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {topSellingSKUs.slice(0, 5).map((sku, idx) => (
              <div
                key={sku.code}
                className="flex justify-between items-center text-xs p-1.5"
              >
                <div className="truncate max-w-[260px]">
                  <span className="font-bold text-slate-400 mr-2">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-slate-800">{sku.desc}</span>
                </div>
                <span className="font-mono text-blue-600 font-semibold">
                  {sku.volume.toLocaleString()} units
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- SECTION 3: TREND LINE TIMELINES (TOTAL & PER SKU VARIANT) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Total Sales Vol Trend */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Daily Sales Volume Trend
            </h2>
          </div>
          <div className="h-36 flex items-end justify-between gap-2 pt-4 px-2">
            {dailyTrends.totalTrend.slice(-7).map(([date, vol]) => {
              const maxVol = Math.max(
                ...dailyTrends.totalTrend.map(([, v]) => v),
                1,
              );
              const pctHeight = (vol / maxVol) * 100;
              return (
                <div
                  key={date}
                  className="flex flex-col items-center flex-1 h-full justify-end group relative"
                >
                  <div className="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] px-1 rounded -translate-y-4 font-mono shadow-md z-10">
                    {vol}
                  </div>
                  <div
                    className="w-full bg-indigo-500/80 group-hover:bg-indigo-600 transition-colors rounded-t-sm"
                    style={{ height: `${pctHeight}%` }}
                  />
                  <span className="text-[9px] font-mono text-muted-foreground mt-2 rotate-12">
                    {date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Trends Per SKU Stacked Matrix */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Layers className="h-4 w-4 text-violet-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Daily Throughput Per SKU Line
            </h2>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto pr-1 text-xs">
            {Object.entries(dailyTrends.skuTrend)
              .slice(0, 4)
              .map(([skuCode, trendMap]) => (
                <div key={skuCode} className="border-b pb-1.5 last:border-0">
                  <span className="font-mono text-[11px] font-bold text-slate-700 block">
                    {skuCode}
                  </span>
                  <div className="flex gap-4 overflow-x-auto pt-0.5 text-[10px] text-muted-foreground font-mono">
                    {Object.entries(trendMap)
                      .slice(-4)
                      .map(([date, val]) => (
                        <span
                          key={date}
                          className="bg-slate-100 px-1.5 py-0.2 rounded shrink-0"
                        >
                          {date}: <b className="text-slate-800">{val}</b>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* --- SECTION 4: HEATMAPS & GRID DENSE ARRAYS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distributor x SKU Heatmap Grid */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Grid className="h-4 w-4 text-rose-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Distributor × SKU Velocity Heatmap
            </h2>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="p-1 border text-left bg-slate-50 font-medium text-slate-500">
                    Distributor Location
                  </th>
                  {heatmapData.skus.map((s) => (
                    <th
                      key={s}
                      className="p-1 border font-mono text-center bg-slate-50 text-slate-600 truncate max-w-[60px]"
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.distributors.map((d) => (
                  <tr key={d}>
                    <td className="p-1 border font-medium truncate max-w-[120px] text-slate-700">
                      {d}
                    </td>
                    {heatmapData.skus.map((s) => {
                      const value = heatmapData.matrix[d]?.[s] || 0;
                      let bgStyle = "bg-slate-50 text-slate-400";
                      if (value > 500)
                        bgStyle = "bg-rose-500 text-white font-bold";
                      else if (value > 150)
                        bgStyle = "bg-rose-300 text-rose-950 font-semibold";
                      else if (value > 0) bgStyle = "bg-rose-100 text-rose-800";

                      return (
                        <td
                          key={s}
                          className={`p-1 border text-center font-mono transition-colors ${bgStyle}`}
                          title={`Dist: ${d} | SKU: ${s}`}
                        >
                          {value || "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agent x Distributor Assignment Matrix */}
        <div className="bg-card p-4 rounded-xl border space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Users className="h-4 w-4 text-cyan-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Agent × Distributor Channel Matrix
            </h2>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="p-1 border text-left bg-slate-50 font-medium text-slate-500">
                    Agent Token Ref
                  </th>
                  {agentDistMatrix.distributors.map((d) => (
                    <th
                      key={d}
                      className="p-1 border font-medium text-center bg-slate-50 text-slate-600 truncate max-w-[70px]"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentDistMatrix.agents.map((a) => (
                  <tr key={a}>
                    <td className="p-1 border font-mono bg-slate-50 font-bold text-slate-600">
                      {a}
                    </td>
                    {agentDistMatrix.distributors.map((d) => {
                      const value = agentDistMatrix.matrix[a]?.[d] || 0;
                      return (
                        <td
                          key={d}
                          className={`p-1 border text-center font-mono ${value ? "bg-cyan-50 text-cyan-800 font-semibold" : "text-slate-300"}`}
                        >
                          {value ? value.toLocaleString() : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
