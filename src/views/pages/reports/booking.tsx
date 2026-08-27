// pages/reports/OrderSalesReportPage.tsx
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Loader2,
  Calendar,
  TrendingUp,
  PieChart as PieIcon,
  Users,
  Package,
  User,
  Building2,
  ClipboardList,
  Layers,
  LineChart as LineChartIcon,
  Download,
} from "lucide-react";
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
  AreaChart,
  Area,
} from "recharts";

// --- SECONDARY SUPABASE CLIENT INSTANTIATION ---
const SECONDARY_SUPABASE_URL = "https://zshlyhsnhzxdkquufsum.supabase.co";
const SECONDARY_SUPABASE_ANON_KEY =
  "sb_publishable_MhgUbcj593As7zdaWEUyNQ_pmOo2YA-";

const secondarySupabase = createClient(
  SECONDARY_SUPABASE_URL,
  SECONDARY_SUPABASE_ANON_KEY,
);

// --- TYPE DEFINITIONS ---
interface OrderProduct {
  id: number;
  order_id: number;
  product_name: string | null;
  variant_name: string | null;
  sku: string | null;
  uom: string | null;
  qty: number | null;
}

interface OrderRecord {
  id: number;
  customer_name: string | null;
  bp_code: string | null;
  street: string | null;
  city: string | null;
  delivery_date: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  user_id: string | null;
  order_by: string | null;
  order_products: OrderProduct[];
}

interface ProfileRecord {
  id: number;
  user_id: string;
  display_name: string | null;
}

type FilterPeriod = "all" | "month" | "day";

const STATUS_COLORS: Record<string, string> = {
  completed: "#10b981", // Emerald
  approved: "#3b82f6", // Blue
  pending: "#f59e0b", // Amber
  reviewed: "#8b5cf6", // Purple
  hold: "#06b6d4", // Cyan
  rejected: "#ef4444", // Red
  cancelled: "#64748b", // Slate
};

const PALETTE = [
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
];

export default function OrderSalesReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  useEffect(() => {
    async function fetchSecondaryData() {
      setIsLoading(true);
      try {
        // 1. Fetch Orders with Order Products (Excluded pricing)
        const { data: ordersData, error: ordersErr } = await secondarySupabase
          .from("orders")
          .select(
            `
            id,
            customer_name,
            bp_code,
            street,
            city,
            delivery_date,
            notes,
            status,
            created_at,
            user_id,
            order_by,
            order_products (
              id,
              order_id,
              product_name,
              variant_name,
              sku,
              uom,
              qty
            )
          `,
          )
          .order("created_at", { ascending: false });

        if (ordersErr) throw ordersErr;

        // 2. Fetch User Profiles to map user_id -> display_name
        const { data: profilesData } = await secondarySupabase
          .from("profiles")
          .select("user_id, display_name");

        const pMap: Record<string, string> = {};
        if (profilesData) {
          (profilesData as ProfileRecord[]).forEach((p) => {
            if (p.user_id && p.display_name) {
              pMap[p.user_id] = p.display_name;
            }
          });
        }

        setProfilesMap(pMap);
        setOrders((ordersData as unknown as OrderRecord[]) || []);
      } catch (err: any) {
        toast.error(
          err.message || "Failed loading data from secondary database",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchSecondaryData();
  }, []);

  // Helper to resolve sales rep / order creator name
  const getOrderRep = (order: OrderRecord) => {
    if (order.order_by && order.order_by.trim().length > 0) {
      return order.order_by.trim();
    }
    if (order.user_id && profilesMap[order.user_id]) {
      return profilesMap[order.user_id];
    }
    return "Unassigned Rep";
  };

  // --- Date Filtered Records ---
  const filteredOrders = useMemo(() => {
    const now = new Date();
    return orders.filter((rec) => {
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
  }, [orders, filterPeriod]);

  // --- Aggregate KPI Metrics ---
  const kpis = useMemo(() => {
    let totalItemsBooked = 0;
    const statusCounts: Record<string, number> = {};
    const uniqueReps = new Set<string>();

    filteredOrders.forEach((order) => {
      uniqueReps.add(getOrderRep(order));

      const st = (order.status || "unknown").toLowerCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      order.order_products?.forEach((p) => {
        totalItemsBooked += p.qty || 0;
      });
    });

    const totalBookings = filteredOrders.length;
    const avgItemsPerBooking =
      totalBookings > 0 ? (totalItemsBooked / totalBookings).toFixed(1) : 0;

    return {
      totalBookings,
      totalItemsBooked,
      avgItemsPerBooking,
      activeReps: uniqueReps.size,
      statusCounts,
    };
  }, [filteredOrders, profilesMap]);

  // --- Booking Trend Over Time ---
  const trendData = useMemo(() => {
    const trends: Record<string, { period: string; bookings: number }> = {};
    const sorted = [...filteredOrders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    sorted.forEach((order) => {
      const d = new Date(order.created_at);
      let key = "";
      if (filterPeriod === "all") {
        key = d.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        });
      } else if (filterPeriod === "month") {
        key = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      } else {
        key = d.toLocaleTimeString(undefined, {
          hour: "numeric",
          hour12: true,
        });
      }

      if (!trends[key]) {
        trends[key] = { period: key, bookings: 0 };
      }
      trends[key].bookings += 1;
    });

    return Object.values(trends);
  }, [filteredOrders, filterPeriod]);

  // --- Status Breakdown for Donut Chart ---
  const statusPieData = useMemo(() => {
    return Object.entries(kpis.statusCounts).map(([status, count]) => ({
      name: status.toUpperCase(),
      value: count,
      fill: STATUS_COLORS[status.toLowerCase()] || "#94a3b8",
    }));
  }, [kpis]);

  // --- Top Customers by Booking Volume ---
  const topCustomersData = useMemo(() => {
    const map: Record<string, { name: string; bookings: number }> = {};

    filteredOrders.forEach((order) => {
      const name = order.customer_name || order.bp_code || "Unknown Customer";
      if (!map[name]) {
        map[name] = { name, bookings: 0 };
      }
      map[name].bookings += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
  }, [filteredOrders]);

  // --- Top Products by Units Booked ---
  const topProductsData = useMemo(() => {
    const map: Record<string, { name: string; units: number }> = {};

    filteredOrders.forEach((order) => {
      order.order_products?.forEach((item) => {
        const pName = item.product_name || "Unknown Product";

        if (!map[pName]) {
          map[pName] = { name: pName, units: 0 };
        }
        map[pName].units += item.qty || 0;
      });
    });

    return Object.values(map)
      .sort((a, b) => b.units - a.units)
      .slice(0, 6);
  }, [filteredOrders]);

  // --- Sales Rep Leaderboard (By Bookings) ---
  const repLeaderboard = useMemo(() => {
    const map: Record<string, { name: string; bookings: number }> = {};

    filteredOrders.forEach((order) => {
      const repName = getOrderRep(order);
      if (!map[repName]) {
        map[repName] = { name: repName, bookings: 0 };
      }
      map[repName].bookings += 1;
    });

    return Object.values(map).sort((a, b) => b.bookings - a.bookings);
  }, [filteredOrders, profilesMap]);

  // Auto-select top rep for the agent-specific chart
  useEffect(() => {
    if (repLeaderboard.length > 0 && !selectedAgent) {
      setSelectedAgent(repLeaderboard[0].name);
    }
  }, [repLeaderboard, selectedAgent]);

  // --- Monthly Breakdown Stacked per Sales Rep (By Bookings) ---
  const repMonthlyStackedData = useMemo(() => {
    const dataMap: Record<string, any> = {};
    const monthsSet = new Set<string>();

    filteredOrders.forEach((order) => {
      const rep = getOrderRep(order);
      const d = new Date(order.created_at);
      const monthKey = d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });

      monthsSet.add(monthKey);

      if (!dataMap[rep]) dataMap[rep] = { repName: rep };
      dataMap[rep][monthKey] = (dataMap[rep][monthKey] || 0) + 1;
    });

    const sortedMonths = Array.from(monthsSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    const dataArray = Object.values(dataMap).sort((a, b) => {
      const totalA = sortedMonths.reduce((sum, m) => sum + (a[m] || 0), 0);
      const totalB = sortedMonths.reduce((sum, m) => sum + (b[m] || 0), 0);
      return totalB - totalA;
    });

    return { data: dataArray, months: sortedMonths };
  }, [filteredOrders, profilesMap]);

  // --- Specific Agent Monthly Breakdown ---
  const agentMonthlyData = useMemo(() => {
    if (!selectedAgent) return [];

    const map: Record<string, number> = {};
    const agentOrders = filteredOrders.filter(
      (order) => getOrderRep(order) === selectedAgent,
    );

    agentOrders.forEach((order) => {
      const d = new Date(order.created_at);
      const monthKey = d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
      map[monthKey] = (map[monthKey] || 0) + 1;
    });

    return Object.entries(map)
      .map(([month, bookings]) => ({ month, bookings }))
      .sort(
        (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
      );
  }, [filteredOrders, selectedAgent, profilesMap]);

  // --- Export to CSV Function ---
  const handleExportToCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error("No data to export.");
      return;
    }

    const headers = [
      "Order ID",
      "Date",
      "Customer",
      "BP Code",
      "Sales Rep",
      "Status",
      "Delivery Date",
      "Total Items",
      "Notes",
    ];

    const rows = filteredOrders.map((order) => {
      const totalItems =
        order.order_products?.reduce((sum, p) => sum + (p.qty || 0), 0) || 0;
      const rep = getOrderRep(order);
      const date = new Date(order.created_at).toLocaleDateString();

      // Escape quotes and commas safely for CSV format
      const escapeCell = (cell: any) => {
        if (cell == null) return '""';
        const str = String(cell);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        order.id,
        date,
        escapeCell(order.customer_name),
        escapeCell(order.bp_code),
        escapeCell(rep),
        order.status,
        escapeCell(order.delivery_date),
        totalItems,
        escapeCell(order.notes),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bookings_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="text-xs font-medium">
          Connecting to secondary database...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bookings & Volume Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Secondary Database • Tracking order volume, product units, and rep
            activity.
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

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Bookings
            </div>
            <div className="text-2xl font-black text-blue-600">
              {kpis.totalBookings.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Units Booked
            </div>
            <div className="text-2xl font-black text-purple-600">
              {kpis.totalItemsBooked.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Avg Units / Booking
            </div>
            <div className="text-2xl font-black text-emerald-600">
              {kpis.avgItemsPerBooking}
            </div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-sm bg-white">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Active Reps
            </div>
            <div className="text-2xl font-black text-indigo-600">
              {kpis.activeReps.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 1: Booking Trend Line + Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Booking Trend Chart */}
        <div className="bg-card p-5 rounded-xl border flex flex-col justify-between space-y-4 lg:col-span-2 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Booking Volume Trajectory
              </h2>
            </div>
          </div>
          <div className="h-60 w-full pt-2">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
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
                  />
                  <Tooltip
                    formatter={(val: any) => [val, "Bookings"]}
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                    labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bookings"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{
                      r: 3,
                      fill: "#3b82f6",
                      strokeWidth: 2,
                      stroke: "#fff",
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                No orders found for selected timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Order Status Distribution */}
        <div className="bg-card p-5 rounded-xl border flex flex-col justify-between space-y-4 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Booking Status Breakdown
            </h2>
          </div>
          <div className="h-48 w-full flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {statusPieData.map((entry, index) => (
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
                No status data available.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {statusPieData.map((st) => (
              <div
                key={st.name}
                className="flex items-center gap-1 text-[10px]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: st.fill }}
                />
                <span className="font-medium text-slate-600">{st.name}:</span>
                <span className="font-bold text-slate-900">{st.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 2: Rep Leaderboard & Stacked Monthly Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rep Leaderboard */}
        <div className="bg-card p-5 rounded-xl border space-y-4 bg-white flex flex-col shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Rep Leaderboard
              </h2>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Ranked by total number of bookings.
            </p>
          </div>
          <div className="w-full pt-2 flex-1 overflow-y-auto custom-scrollbar">
            {repLeaderboard.length > 0 ? (
              <div
                style={{ height: Math.max(240, repLeaderboard.length * 36) }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={repLeaderboard}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      stroke="#64748b"
                      fontSize={10}
                      width={100}
                    />
                    <Tooltip
                      formatter={(v: any) => [v, "Bookings"]}
                      contentStyle={{
                        background: "#fff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "11px",
                      }}
                    />
                    <Bar
                      dataKey="bookings"
                      name="Total Bookings"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
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
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground italic">
                No reps recorded.
              </div>
            )}
          </div>
        </div>

        {/* Stacked Rep Monthly Volume (Vertical Layout to remove internal scrollbar) */}
        <div className="bg-card p-5 rounded-xl border flex flex-col lg:col-span-2 bg-white shadow-sm">
          <div className="flex items-center justify-between shrink-0 mb-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Monthly Booking Volume by Rep
              </h2>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase bg-slate-100 px-2 py-1 rounded">
              Stacked Bookings
            </div>
          </div>

          <div className="w-full pt-4">
            {repMonthlyStackedData.data.length > 0 ? (
              <div
                style={{
                  height: Math.max(300, repMonthlyStackedData.data.length * 45),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={repMonthlyStackedData.data}
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
                      dataKey="repName"
                      tickLine={false}
                      axisLine={false}
                      stroke="#64748b"
                      fontSize={11}
                      width={120}
                    />
                    <Tooltip
                      formatter={(val: any) => [val, "Bookings"]}
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        background: "#fff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                      labelStyle={{
                        fontSize: "11px",
                        fontWeight: "bold",
                        color: "#0f172a",
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                    {repMonthlyStackedData.months.map((m, idx) => (
                      <Bar
                        key={m}
                        dataKey={m}
                        name={m}
                        stackId="a"
                        fill={PALETTE[idx % PALETTE.length]}
                        barSize={20}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground italic">
                No monthly breakdown available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: Specific Agent Performance Deep Dive */}
      <div className="bg-card p-5 rounded-xl border bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Agent Booking Deep-Dive
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">
              Select Agent:
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="text-xs border-slate-200 border rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {repLeaderboard.map((rep) => (
                <option key={rep.name} value={rep.name}>
                  {rep.name} ({rep.bookings} total)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-64 w-full">
          {agentMonthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={agentMonthlyData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorBookings"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  dy={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="#94a3b8"
                  fontSize={11}
                />
                <Tooltip
                  formatter={(val: any) => [val, "Bookings"]}
                  contentStyle={{
                    background: "#fff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                  labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                />
                <Area
                  type="monotone"
                  dataKey="bookings"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorBookings)"
                  activeDot={{
                    r: 6,
                    fill: "#8b5cf6",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              No booking history for this agent.
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Top Products & Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products by Volume */}
        <div className="bg-card p-5 rounded-xl border bg-white shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Top Products by Units Booked
            </h2>
          </div>
          <div className="h-64 w-full">
            {topProductsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topProductsData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    stroke="#64748b"
                    fontSize={10}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <Tooltip
                    formatter={(v: any) => [v, "Units"]}
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "11px",
                    }}
                  />
                  <Bar
                    dataKey="units"
                    name="Units"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                No product sales records.
              </div>
            )}
          </div>
        </div>

        {/* Top Customers by Bookings */}
        <div className="bg-card p-5 rounded-xl border bg-white shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Top Customers by Total Bookings
            </h2>
          </div>
          <div className="divide-y border rounded-lg overflow-hidden bg-slate-50/50">
            {topCustomersData.length > 0 ? (
              topCustomersData.map((cust, idx) => (
                <div
                  key={cust.name}
                  className="p-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {cust.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                      {cust.bookings}{" "}
                      {cust.bookings === 1 ? "Booking" : "Bookings"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                No customer data.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 5: Data Table Export */}
      <div className="bg-card p-5 rounded-xl border bg-white shadow-sm space-y-4 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Booking Records Detail
            </h2>
          </div>
          <button
            onClick={handleExportToCSV}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors rounded-md text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Export to CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Sales Rep</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const itemsCount =
                    order.order_products?.reduce(
                      (sum, p) => sum + (p.qty || 0),
                      0,
                    ) || 0;
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        #{order.id}
                      </td>
                      <td className="px-4 py-3">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {order.customer_name || order.bp_code || "-"}
                      </td>
                      <td className="px-4 py-3">{getOrderRep(order)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${STATUS_COLORS[order.status?.toLowerCase() || ""] || "#94a3b8"}20`,
                            color:
                              STATUS_COLORS[
                                order.status?.toLowerCase() || ""
                              ] || "#94a3b8",
                          }}
                        >
                          {order.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {itemsCount}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground italic"
                  >
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
