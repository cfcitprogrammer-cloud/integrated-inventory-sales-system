// pages/reports/InventoryReportPage.tsx
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Calendar,
  Users,
  CalendarDays,
  User,
  ClipboardList,
  MapPin,
  PackageCheck,
  TrendingUp,
  PieChart as PieIcon,
} from "lucide-react";
import { supabase } from "@/config/db";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

interface InventoryItem {
  qty: number | null;
}

interface InventoryRawRecord {
  id: string;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  user_id?: string;
  tbl_employees?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  tbl_inventory_items: InventoryItem[];
}

type FilterPeriod = "all" | "month" | "day";

const MONTH_COLORS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f97316",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
  "#6366f1",
  "#84cc16",
  "#14b8a6",
  "#eab308",
  "#ef4444",
];

export default function InventoryReportPage() {
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<InventoryRawRecord[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
  const [selectedIndividualAgent, setSelectedIndividualAgent] =
    useState<string>("");

  useEffect(() => {
    async function fetchInventoryData() {
      if (!currentCompanyId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase()
          .from("tbl_inventory")
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
            tbl_inventory_items (
              qty
            )
          `,
          )
          .eq("company_id", currentCompanyId);

        if (error) throw error;

        setRawData((data as unknown as InventoryRawRecord[]) || []);
      } catch (err: any) {
        toast.error(err.message || "Failed loading Inventory reporting layers");
      } finally {
        setIsLoading(false);
      }
    }
    fetchInventoryData();
  }, [currentCompanyId]);

  // --- Filter Logic Layer ---
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

  // --- KPI Metrics ---
  const totals = useMemo(() => {
    const totalInventories = filteredData.length;
    const uniqueOutlets = new Set<string>();
    let totalItemsCounted = 0;

    filteredData.forEach((rec) => {
      if (rec.bp_code) uniqueOutlets.add(rec.bp_code);
      else if (rec.outlet_name) uniqueOutlets.add(rec.outlet_name);

      rec.tbl_inventory_items?.forEach((item) => {
        totalItemsCounted += item.qty || 0;
      });
    });

    return {
      totalInventories,
      uniqueOutlets: uniqueOutlets.size,
      totalItemsCounted,
    };
  }, [filteredData]);

  // STRICT HELPER: Exclusively returns first_name + last_name
  const getAgentName = (rec: InventoryRawRecord) => {
    const firstName = rec.tbl_employees?.first_name?.trim() || "";
    const lastName = rec.tbl_employees?.last_name?.trim() || "";
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName.length > 0 ? fullName : "Unnamed Employee";
  };

  // --- Agent Leaderboard Mapping (ALL USERS) ---
  const agentChartData = useMemo(() => {
    const agentCounts: Record<string, number> = {};
    filteredData.forEach((rec) => {
      const agentName = getAgentName(rec);
      agentCounts[agentName] = (agentCounts[agentName] || 0) + 1;
    });
    return Object.entries(agentCounts)
      .map(([name, inventories]) => ({ name, inventories }))
      .sort((a, b) => b.inventories - a.inventories);
  }, [filteredData]);

  // --- Top Outlets Pie Chart Mapping ---
  const topOutletsData = useMemo(() => {
    const outletCounts: Record<string, number> = {};
    filteredData.forEach((rec) => {
      const name = rec.outlet_name || rec.bp_code || "Unknown Outlet";
      outletCounts[name] = (outletCounts[name] || 0) + 1;
    });

    return Object.entries(outletCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) // Top 5
      .map((item, index) => ({
        ...item,
        fill: MONTH_COLORS[index % MONTH_COLORS.length],
      }));
  }, [filteredData]);

  // --- Chronological Trend Mapping ---
  const trendChartData = useMemo(() => {
    const trends: Record<string, { period: string; totalInventories: number }> =
      {};
    const sortedData = [...filteredData].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    sortedData.forEach((rec) => {
      const dateObj = new Date(rec.created_at);
      let dateKey = "";
      if (filterPeriod === "all")
        dateKey = dateObj.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        });
      else if (filterPeriod === "month")
        dateKey = dateObj.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      else
        dateKey = dateObj.toLocaleTimeString(undefined, {
          hour: "numeric",
          hour12: true,
        });

      if (!trends[dateKey]) {
        trends[dateKey] = {
          period: dateKey,
          totalInventories: 0,
        };
      }
      trends[dateKey].totalInventories += 1;
    });
    return Object.values(trends);
  }, [filteredData, filterPeriod]);

  // Set the default selected individual agent once data loads
  useEffect(() => {
    if (agentChartData.length > 0 && !selectedIndividualAgent) {
      setSelectedIndividualAgent(agentChartData[0].name);
    }
  }, [agentChartData, selectedIndividualAgent]);

  // --- Individual Agent Monthly Breakdown Mapping ---
  const individualAgentMonthlyData = useMemo(() => {
    if (!selectedIndividualAgent) return [];

    const agentRecords = filteredData.filter(
      (rec) => getAgentName(rec) === selectedIndividualAgent,
    );
    const monthlyCounts: Record<string, number> = {};

    agentRecords.forEach((rec) => {
      const dateObj = new Date(rec.created_at);
      const monthKey = dateObj.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    });

    return Object.entries(monthlyCounts)
      .map(([month, inventories]) => {
        const [monthStr, yearStr] = month.split(" ");
        return {
          month,
          inventories,
          timestamp: new Date(`${monthStr} 1, ${yearStr}`).getTime(),
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredData, selectedIndividualAgent]);

  // --- All Agents Monthly Breakdown Mapping ---
  const agentMonthlyChartData = useMemo(() => {
    const dataMap: Record<string, any> = {};
    const uniqueMonths = new Set<string>();

    filteredData.forEach((rec) => {
      const agentName = getAgentName(rec);
      const dateObj = new Date(rec.created_at);
      const monthKey = dateObj.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });

      uniqueMonths.add(monthKey);

      if (!dataMap[agentName]) dataMap[agentName] = { agentName };
      dataMap[agentName][monthKey] = (dataMap[agentName][monthKey] || 0) + 1;
    });

    const sortedMonths = Array.from(uniqueMonths).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    const dataArray = Object.values(dataMap).sort((a, b) => {
      const totalA = sortedMonths.reduce((sum, m) => sum + (a[m] || 0), 0);
      const totalB = sortedMonths.reduce((sum, m) => sum + (b[m] || 0), 0);
      return totalB - totalA;
    });

    return { data: dataArray, months: sortedMonths };
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        <span className="text-xs font-medium">
          Analyzing inventory records...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Inventory Tracking Report
          </h1>
          <p className="text-xs text-muted-foreground">
            Monitor inventory submissions, agent productivity, and outlet
            coverage.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border p-1 rounded-lg shadow-sm self-start sm:self-auto">
          <div className="p-1 text-slate-400 hidden xs:block">
            <Calendar className="h-3.5 w-3.5" />
          </div>
          {(["all", "month", "day"] as const).map((period) => (
            <button
              key={period}
              onClick={() => setFilterPeriod(period)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                filterPeriod === period
                  ? "bg-slate-900 text-white shadow-sm"
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

      {/* --- KPI CARDS SECTION --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Inventories Filed
            </div>
            <div className="text-2xl font-black text-slate-900">
              {totals.totalInventories.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Unique Outlets Visited
            </div>
            <div className="text-2xl font-black text-indigo-600">
              {totals.uniqueOutlets.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Items Counted
            </div>
            <div className="text-2xl font-black text-blue-600">
              {totals.totalItemsCounted.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* --- VISUALIZATIONS SECTION ROW 1 --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Outlets Pie Chart */}
        <div className="bg-card p-5 rounded-xl border flex flex-col justify-between space-y-4 bg-white shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Top 5 Most Visited Outlets
              </h2>
            </div>
          </div>
          <div className="h-44 w-full flex items-center justify-center py-2">
            {topOutletsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topOutletsData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {topOutletsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "11px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                No data context available.
              </div>
            )}
          </div>
        </div>

        {/* Global Trend Chart */}
        <div className="bg-card p-5 rounded-xl border space-y-4 lg:col-span-2 bg-white flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Inventories Created Over Time
              </h2>
            </div>
          </div>
          <div className="h-52 w-full pt-4">
            {trendChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendChartData}
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="period"
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
                    cursor={{
                      stroke: "#e2e8f0",
                      strokeWidth: 1,
                      strokeDasharray: "3 3",
                    }}
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                    labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalInventories"
                    name="Inventories Recorded"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{
                      r: 3,
                      fill: "#10b981",
                      strokeWidth: 2,
                      stroke: "#fff",
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                No active coordinates inside selected scope.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- VISUALIZATIONS SECTION ROW 2 --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* All Agents Total Leaderboard (Full Height) */}
        <div className="bg-card p-5 rounded-xl border space-y-4 lg:col-span-1 bg-white flex flex-col h-full shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Agent Leaderboard
              </h2>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Total inventories submitted per agent.
            </p>
          </div>
          <div className="w-full pt-2 flex-1 overflow-y-auto custom-scrollbar">
            {agentChartData.length > 0 ? (
              <div
                style={{ height: Math.max(250, agentChartData.length * 35) }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={agentChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      stroke="#64748b"
                      fontSize={10}
                      width={100}
                    />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        background: "#fff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "11px",
                      }}
                    />
                    <Bar
                      dataKey="inventories"
                      name="Inventories"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                      label={{
                        position: "right",
                        fill: "#64748b",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground italic">
                No data available.
              </div>
            )}
          </div>
        </div>

        {/* All Agents Monthly Breakdown Stacked (Vertical Layout) */}
        <div className="bg-card p-5 rounded-xl border flex flex-col lg:col-span-2 bg-white shadow-sm">
          <div className="flex items-center justify-between shrink-0 mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Monthly Breakdown by Agent
              </h2>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase bg-slate-100 px-2 py-1 rounded">
              All Users
            </div>
          </div>

          <div className="w-full pt-4">
            {agentMonthlyChartData.data.length > 0 ? (
              <div
                style={{
                  height: Math.max(300, agentMonthlyChartData.data.length * 45),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={agentMonthlyChartData.data}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      stroke="#94a3b8"
                      fontSize={11}
                    />
                    <YAxis
                      type="category"
                      dataKey="agentName"
                      tickLine={false}
                      axisLine={false}
                      stroke="#64748b"
                      fontSize={11}
                      width={130}
                    />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        background: "#fff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                      labelStyle={{
                        fontSize: "11px",
                        fontWeight: "bold",
                        marginBottom: "8px",
                        color: "#0f172a",
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                    {agentMonthlyChartData.months.map((month, index) => (
                      <Bar
                        key={month}
                        dataKey={month}
                        name={month}
                        stackId="a"
                        fill={MONTH_COLORS[index % MONTH_COLORS.length]}
                        barSize={20}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground italic">
                No monthly data available for the current scope.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- VISUALIZATIONS SECTION ROW 3 (Individual Agent Breakdown) --- */}
      <div className="bg-card p-5 rounded-xl border space-y-4 bg-white flex flex-col justify-between shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Individual Agent Performance
            </h2>
          </div>
          <select
            value={selectedIndividualAgent}
            onChange={(e) => setSelectedIndividualAgent(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none"
          >
            {agentChartData.length === 0 && (
              <option value="">No Agents Available</option>
            )}
            {agentChartData.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <div className="h-72 w-full pt-4">
          {individualAgentMonthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={individualAgentMonthlyData}
                margin={{ top: 5, right: 10, left: -20, bottom: 25 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  stroke="#64748b"
                  fontSize={11}
                  dy={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="#94a3b8"
                  fontSize={11}
                  dx={-4}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    background: "#fff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                  labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                />
                <Bar
                  dataKey="inventories"
                  name="Inventories Submitted"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={60}
                  label={{
                    position: "top",
                    fill: "#64748b",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              No monthly data available for the selected agent.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
