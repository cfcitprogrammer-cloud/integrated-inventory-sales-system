// pages/reports/BadOrderReportPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Clock,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/config/db";

interface BOItem {
  item_code: string;
  item_description: string;
  request_qty: number;
  actual_qty: number | null;
  uom: string;
}

interface BORawRecord {
  id: string;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  workflow_type: "For Disposal" | "Return to Warehouse";
  status: string; // Pending, Approved, Rejected, etc.
  tbl_bo_input_items: BOItem[];
}

export default function BadOrderReportPage() {
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<BORawRecord[]>([]);

  useEffect(() => {
    async function fetchBadOrderData() {
      if (!currentCompanyId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase()
          .from("tbl_bo_input")
          .select(
            `
            id,
            created_at,
            outlet_name,
            bp_code,
            workflow_type,
            status,
            tbl_bo_input_items (
              item_code,
              item_description,
              request_qty,
              actual_qty,
              uom
            )
          `,
          )
          .eq("company_id", currentCompanyId);

        if (error) throw error;
        setRawData((data as unknown as BORawRecord[]) || []);
      } catch (err: any) {
        toast.error(err.message || "Failed loading Bad Order reporting layers");
      } finally {
        setIsLoading(false);
      }
    }
    fetchBadOrderData();
  }, [currentCompanyId]);

  // --- 1. Top-Level KPI Calculations ---
  const kpis = useMemo(() => {
    let totalBadOrders = rawData.length;
    let returnToWarehouse = 0;
    let forDisposal = 0;
    let pendingAction = 0;

    rawData.forEach((rec) => {
      if (rec.workflow_type === "Return to Warehouse") returnToWarehouse++;
      if (rec.workflow_type === "For Disposal") forDisposal++;
      if (
        rec.status?.toLowerCase() === "pending" ||
        rec.status?.toLowerCase() === "pending action"
      ) {
        pendingAction++;
      }
    });

    return { totalBadOrders, returnToWarehouse, forDisposal, pendingAction };
  }, [rawData]);

  // --- 2. Workflow Breakdown Data Math (Pie Chart Equivalent Elements) ---
  const workflowBreakdown = useMemo(() => {
    const total = kpis.totalBadOrders || 1;
    const disposalPct = Math.round((kpis.forDisposal / total) * 100);
    const warehousePct = Math.round((kpis.returnToWarehouse / total) * 100);
    return { disposalPct, warehousePct };
  }, [kpis]);

  // --- 3. Bad Orders / Workflow Over Time Timeline Matrices ---
  const timelineTrends = useMemo(() => {
    const trends: Record<
      string,
      { total: number; disposal: number; warehouse: number }
    > = {};

    // Sort ascending chronologically for graph presentation tracking mapping
    rawData
      .slice()
      .reverse()
      .forEach((rec) => {
        const dateKey = new Date(rec.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        if (!trends[dateKey]) {
          trends[dateKey] = { total: 0, disposal: 0, warehouse: 0 };
        }

        trends[dateKey].total++;
        if (rec.workflow_type === "For Disposal") trends[dateKey].disposal++;
        if (rec.workflow_type === "Return to Warehouse")
          trends[dateKey].warehouse++;
      });

    return Object.entries(trends).slice(-8); // Limit viewport to trailing 8 operating periods
  }, [rawData]);

  // --- 4. SKU Problem Frequency Log Report ---
  const skuProblemFrequency = useMemo(() => {
    const frequencyMap: Record<
      string,
      { desc: string; occurrences: number; totalVolume: number }
    > = {};

    rawData.forEach((rec) => {
      rec.tbl_bo_input_items?.forEach((item) => {
        if (!frequencyMap[item.item_code]) {
          frequencyMap[item.item_code] = {
            desc: item.item_description,
            occurrences: 0,
            totalVolume: 0,
          };
        }
        frequencyMap[item.item_code].occurrences += 1;
        frequencyMap[item.item_code].totalVolume +=
          Number(item.request_qty) || 0;
      });
    });

    return Object.entries(frequencyMap)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.occurrences - a.occurrences); // Ranked by frequency occurrences
  }, [rawData]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        <span className="text-xs font-medium">
          Analyzing reclamation logs...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6 bg-slate-50/50 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bad Order Reclamation Report
        </h1>
        <p className="text-xs text-muted-foreground">
          Monitor inventory defects, dynamic routing distributions, and dynamic
          SKU failure rates.
        </p>
      </div>

      {/* --- SECTION 1: EXECUTION METRIC KPI CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Bad Orders */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs">
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Bad Orders
            </div>
            <div className="text-2xl font-black text-slate-900">
              {kpis.totalBadOrders}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                Tickets
              </span>
            </div>
          </div>
        </div>

        {/* Return to Warehouse */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Return to Warehouse
            </div>
            <div className="text-2xl font-black text-blue-600">
              {kpis.returnToWarehouse}
            </div>
          </div>
        </div>

        {/* For Disposal */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              For Disposal
            </div>
            <div className="text-2xl font-black text-orange-600">
              {kpis.forDisposal}
            </div>
          </div>
        </div>

        {/* Pending Action */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Pending Action
            </div>
            <div className="text-2xl font-black text-amber-500">
              {kpis.pendingAction}
            </div>
          </div>
        </div>
      </div>

      {/* --- SECTION 2: GRAPH TIMELINES & VISUALIZATIONS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Workflow Type Breakdown (Pie / Segmented Component Visualizer) */}
        <div className="bg-card p-5 rounded-xl border space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Workflow Type Proportions
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Route structural split percentages.
            </p>
          </div>

          <div className="pt-4 space-y-4">
            {/* Visual Bar Split Representation */}
            <div className="w-full h-5 rounded-full bg-slate-100 flex overflow-hidden border">
              <div
                className="bg-orange-500 transition-all duration-500"
                style={{ width: `${workflowBreakdown.disposalPct}%` }}
                title={`For Disposal: ${workflowBreakdown.disposalPct}%`}
              />
              <div
                className="bg-blue-500 transition-all duration-500"
                style={{ width: `${workflowBreakdown.warehousePct}%` }}
                title={`Return to Warehouse: ${workflowBreakdown.warehousePct}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500 block" />
                <div>
                  <span className="font-medium text-slate-700 block">
                    For Disposal
                  </span>
                  <b className="font-mono text-slate-900">
                    {workflowBreakdown.disposalPct}%
                  </b>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 block" />
                <div>
                  <span className="font-medium text-slate-700 block">
                    Warehouse Returns
                  </span>
                  <b className="font-mono text-slate-900">
                    {workflowBreakdown.warehousePct}%
                  </b>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bad Orders Over Time Timeline Line Chart Grid Component */}
        <div className="bg-card p-5 rounded-xl border space-y-2 lg:col-span-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Bad Orders Influx Over Time
            </h2>
          </div>

          {/* Micro Graph Renderer Core */}
          <div className="h-40 flex items-end justify-between gap-3 pt-6 px-2">
            {timelineTrends.map(([date, counts]) => {
              const maxVal = Math.max(
                ...timelineTrends.map(([, c]) => c.total),
                1,
              );
              const totalHeight = (counts.total / maxVal) * 100;
              const disposalHeight =
                (counts.disposal / counts.total || 0) * 100;

              return (
                <div
                  key={date}
                  className="flex flex-col items-center flex-1 h-full justify-end group relative"
                >
                  {/* Tooltip Overlay Matrix */}
                  <div className="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[9px] p-1.5 rounded -translate-y-6 font-mono shadow-lg z-20 space-y-0.5 pointer-events-none">
                    <div>Total: {counts.total}</div>
                    <div className="text-orange-300">
                      Disposal: {counts.disposal}
                    </div>
                    <div className="text-blue-300">
                      Warehouse: {counts.warehouse}
                    </div>
                  </div>

                  {/* Stacked Interactive Component Columns */}
                  <div
                    className="w-full bg-slate-200 group-hover:bg-slate-300 transition-colors rounded-t-xs overflow-hidden flex flex-col justify-end"
                    style={{ height: `${totalHeight}%` }}
                  >
                    <div
                      className="w-full bg-orange-500/80"
                      style={{ height: `${disposalHeight}%` }}
                    />
                    <div className="w-full bg-blue-500/80 flex-1" />
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground mt-2 shrink-0">
                    {date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- SECTION 3: SKU PROBLEM FREQUENCY LEDGER --- */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-card p-5 rounded-xl border space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <BarChart3 className="h-4 w-4 text-rose-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              SKU Defect Frequency Report
            </h2>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b">
                  <th className="p-3 font-semibold">SKU Code Reference</th>
                  <th className="p-3 font-semibold">Item Description Name</th>
                  <th className="p-3 font-semibold text-center">
                    Defect Tickets (Frequency)
                  </th>
                  <th className="p-3 font-semibold text-right">
                    Accumulated Return Volume
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {skuProblemFrequency.slice(0, 10).map((sku) => (
                  <tr
                    key={sku.code}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3 font-mono font-bold text-slate-700">
                      {sku.code}
                    </td>
                    <td className="p-3 text-muted-foreground max-w-sm truncate">
                      {sku.desc}
                    </td>
                    <td className="p-3 text-center">
                      <span className="bg-rose-50 text-rose-700 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                        {sku.occurrences} incidents
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {sku.totalVolume.toLocaleString()} units
                    </td>
                  </tr>
                ))}
                {skuProblemFrequency.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center italic text-muted-foreground"
                    >
                      No matching bad order material frequency arrays found
                      inside company records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
