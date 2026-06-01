// pages/reports/SalesToTradeReportPage.tsx
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  TrendingUp,
  BarChart3,
  Layers,
  Users,
  Calendar,
} from "lucide-react";
import { supabase } from "@/config/db";

// Pure, standard Recharts primitives for stable dashboard rendering
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface STTItem {
  item_code: string;
  item_description: string;
  qty: number;
  uom: string;
}

interface EmployeeRelation {
  first_name: string;
  last_name: string;
}

interface STTRawRecord {
  id: string;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  user_id: string;
  tbl_stt_items: STTItem[];
  tbl_employees: EmployeeRelation | null; // Joined employee layer
}

type FilterPeriod = "all" | "month" | "day";

export default function SalesToTradeReportPage() {
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<STTRawRecord[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");

  useEffect(() => {
    async function fetchReportData() {
      if (!currentCompanyId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        // Left join using your explicit first_name and last_name schema design
        const { data, error } = await supabase()
          .from("tbl_stt")
          .select(
            `
            id,
            created_at,
            outlet_name,
            bp_code,
            user_id,
            tbl_employees (
              first_name,
              last_name
            ),
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

  // --- Dynamic Filtering Layer (All, Month, Day) ---
  const filteredData = useMemo(() => {
    const now = new Date();
    return rawData.filter((rec) => {
      if (filterPeriod === "all") return true;

      const recordDate = new Date(rec.created_at);
      if (filterPeriod === "month") {
        return (
          recordDate.getMonth() === now.getMonth() &&
          recordDate.getFullYear() === now.getFullYear()
        );
      }
      if (filterPeriod === "day") {
        return (
          recordDate.getDate() === now.getDate() &&
          recordDate.getMonth() === now.getMonth() &&
          recordDate.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  }, [rawData, filterPeriod]);

  // --- 1. Total Cumulative Quantity Calculation ---
  const totalQuantity = useMemo(() => {
    return filteredData.reduce((total, rec) => {
      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;
      return total + itemSum;
    }, 0);
  }, [filteredData]);

  // --- 2. Distributor Calculation Matrix ---
  const distributorSales = useMemo(() => {
    const counts: Record<string, { name: string; volume: number }> = {};
    filteredData.forEach((rec) => {
      const bp = rec.bp_code || "Unknown Dist";
      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;

      if (!counts[bp]) {
        counts[bp] = {
          name: rec.outlet_name || bp,
          volume: 0,
        };
      }
      counts[bp].volume += itemSum;
    });
    return Object.values(counts).sort((a, b) => b.volume - a.volume);
  }, [filteredData]);

  // --- 3. Resolved Employee Performance Ledger ---
  const agentPerformanceList = useMemo(() => {
    const agents: Record<string, number> = {};

    filteredData.forEach((rec) => {
      let agentName = "System Agent";

      if (rec.tbl_employees) {
        const { first_name, last_name } = rec.tbl_employees;
        agentName =
          `${first_name || ""} ${last_name || ""}`.trim() || "Unnamed Employee";
      } else if (rec.user_id) {
        agentName = `ID: ${rec.user_id.substring(0, 8)}`;
      }

      const itemSum =
        rec.tbl_stt_items?.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) ||
        0;
      agents[agentName] = (agents[agentName] || 0) + itemSum;
    });

    return Object.entries(agents)
      .map(([name, volume]) => ({ name, volume }))
      .sort((a, b) => b.volume - a.volume);
  }, [filteredData]);

  // --- 4. Complete SKU Volumetric Listing ---
  const skuSellingList = useMemo(() => {
    const skus: Record<string, { desc: string; volume: number }> = {};
    filteredData.forEach((rec) => {
      rec.tbl_stt_items?.forEach((item) => {
        if (!skus[item.item_code]) {
          skus[item.item_code] = { desc: item.item_description, volume: 0 };
        }
        skus[item.item_code].volume += Number(item.qty) || 0;
      });
    });
    return Object.entries(skus)
      .map(([code, meta]) => ({ code, ...meta }))
      .sort((a, b) => b.volume - a.volume);
  }, [filteredData]);

  // --- 5. Chronological Recharts Daily Trend Format ---
  const chartTrendData = useMemo(() => {
    const trends: Record<string, number> = {};

    filteredData
      .slice()
      .reverse()
      .forEach((rec) => {
        const dateKey = new Date(rec.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        const itemSum =
          rec.tbl_stt_items?.reduce(
            (acc, i) => acc + (Number(i.qty) || 0),
            0,
          ) || 0;
        trends[dateKey] = (trends[dateKey] || 0) + itemSum;
      });

    return Object.entries(trends)
      .map(([date, volume]) => ({
        date,
        volume,
      }))
      .slice(-8);
  }, [filteredData]);

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
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sales to Trade Analytical Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            Real-time throughput metrics, channel performance trackers, and
            product variants.
          </p>
        </div>

        {/* Period Filters */}
        <div className="flex items-center gap-2 bg-white border p-1 rounded-lg shadow-2xs self-start sm:self-auto">
          <div className="p-1 text-slate-400 hidden xs:block">
            <Calendar className="h-3.5 w-3.5" />
          </div>
          {(["all", "month", "day"] as const).map((period) => (
            <button
              key={period}
              onClick={() => setFilterPeriod(period)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                filterPeriod === period
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {period === "all"
                ? "All Time"
                : period === "month"
                  ? "This Month"
                  : "Today"}
            </button>
          ))}
        </div>
      </div>

      {/* --- SECTION 1: KPIS AND VOLUMETRIC METRICS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cumulative Active Volume Card */}
        <div className="bg-card p-5 rounded-xl border space-y-2 bg-white shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-4 w-4 text-blue-500" /> Active Throughput
            Volume
          </div>
          <div className="text-3xl font-black tracking-tight text-slate-900">
            {totalQuantity.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              Units
            </span>
          </div>
        </div>

        {/* Lead Performing Product Segment Card */}
        <div className="bg-card p-5 rounded-xl border space-y-2 bg-white shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-4 w-4 text-orange-500" /> Top Selling Variant
          </div>
          {skuSellingList[0] ? (
            <div>
              <div className="text-xl font-bold truncate text-slate-800">
                {skuSellingList[0].desc}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                Code: {skuSellingList[0].code} (
                <b className="text-slate-700">
                  {skuSellingList[0].volume.toLocaleString()}
                </b>{" "}
                units)
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground pt-1">
              No historical data in current scope.
            </div>
          )}
        </div>

        {/* Lead Employee Operator Performance Card */}
        <div className="bg-card p-5 rounded-xl border space-y-2 bg-white shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4 text-emerald-500" /> Top Performing Agent
          </div>
          {agentPerformanceList[0] ? (
            <div>
              <div className="text-xl font-bold text-slate-800 truncate">
                {agentPerformanceList[0].name}
              </div>
              <div className="text-xs text-muted-foreground">
                Aggregated Volume:{" "}
                <span className="font-bold text-emerald-600">
                  {agentPerformanceList[0].volume.toLocaleString()}
                </span>{" "}
                units
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground pt-1">
              No active employee logs.
            </div>
          )}
        </div>
      </div>

      {/* --- SECTION 2: VOLUME BY DISTRIBUTOR & CHART TRENDS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by Distributor List Panel */}
        <div className="bg-card p-5 rounded-xl border space-y-3 bg-white shadow-xs lg:col-span-1">
          <div className="border-b pb-2">
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Sales via Distributors
            </h2>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {distributorSales.length > 0 ? (
              distributorSales.map((d, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-colors"
                >
                  <span className="font-medium text-slate-700 truncate max-w-[180px]">
                    {d.name}
                  </span>
                  <span className="font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                    {d.volume.toLocaleString()} pcs
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs italic text-muted-foreground p-2">
                No distributors active.
              </div>
            )}
          </div>
        </div>

        {/* Native Recharts BarChart Canvas Box */}
        <div className="bg-card p-5 rounded-xl border space-y-3 bg-white shadow-xs lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center gap-2 border-b pb-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Daily Sales Volume Trend
            </h2>
          </div>

          <div className="h-56 w-full pt-2">
            {chartTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartTrendData}
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    stroke="#94a3b8"
                    fontSize={11}
                    dy={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="#94a3b8"
                    fontSize={11}
                    dx={-4}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                    labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  <Bar
                    dataKey="volume"
                    name="Units Transacted"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={45}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                No active metrics inside selected timeframe.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SECTION 3: FULL SKU RANKS AND SALES EMPLOYEES LISTS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Full SKU Velocity Ledger List */}
        <div className="bg-card p-5 rounded-xl border space-y-3 bg-white shadow-xs">
          <div className="border-b pb-2">
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              SKU Sales Velocity Ledger
            </h2>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {skuSellingList.length > 0 ? (
              skuSellingList.map((sku, idx) => (
                <div
                  key={sku.code}
                  className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent"
                >
                  <div className="truncate max-w-[220px] sm:max-w-[320px]">
                    <span className="font-bold text-slate-400 mr-2 font-mono">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-slate-800">
                      {sku.desc}
                    </span>
                  </div>
                  <span className="font-mono text-blue-600 font-bold shrink-0">
                    {sku.volume.toLocaleString()} units
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs italic text-muted-foreground p-2">
                No active variants found.
              </div>
            )}
          </div>
        </div>

        {/* Full Employees Performance Ledger List */}
        <div className="bg-card p-5 rounded-xl border space-y-3 bg-white shadow-xs">
          <div className="border-b pb-2">
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Employee Performance Ledger
            </h2>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {agentPerformanceList.length > 0 ? (
              agentPerformanceList.map((agent, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent"
                >
                  <div className="truncate">
                    <span className="font-bold text-slate-400 mr-2 font-mono">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-slate-700">
                      {agent.name}
                    </span>
                  </div>
                  <span className="font-mono text-emerald-600 font-bold shrink-0">
                    {agent.volume.toLocaleString()} units
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs italic text-muted-foreground p-2">
                No employee metrics context.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
