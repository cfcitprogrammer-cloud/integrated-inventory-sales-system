// pages/reports/BadOrderReportPage.tsx
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Clock,
  TrendingUp,
  PieChart as PieIcon,
  Calendar,
} from "lucide-react";
import { supabase } from "@/config/db";

// Using pure, standard Recharts primitives directly
import {
  LineChart,
  Line,
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
  status: string;
  tbl_bo_input_items: BOItem[];
}

type FilterPeriod = "all" | "month" | "day";

export default function BadOrderReportPage() {
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<BORawRecord[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");

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

  // --- KPI Metrics & Item Accumulations Layer ---
  const totals = useMemo(() => {
    const totalTickets = filteredData.length;
    let totalItemQty = 0;
    let returnWarehouseQty = 0;
    let forDisposalQty = 0;
    let pendingActionQty = 0;

    filteredData.forEach((rec) => {
      const ticketItemSum = (rec.tbl_bo_input_items || []).reduce(
        (sum, item) => sum + (item.request_qty || 0),
        0,
      );

      totalItemQty += ticketItemSum;

      if (rec.workflow_type === "Return to Warehouse") {
        returnWarehouseQty += ticketItemSum;
      }
      if (rec.workflow_type === "For Disposal") {
        forDisposalQty += ticketItemSum;
      }

      if (
        rec.status?.toLowerCase() === "pending" ||
        rec.status?.toLowerCase() === "pending action"
      ) {
        pendingActionQty += ticketItemSum;
      }
    });

    return {
      totalTickets,
      totalItemQty,
      returnWarehouseQty,
      forDisposalQty,
      pendingActionQty,
    };
  }, [filteredData]);

  // --- Pie Chart Matrix Mapping ---
  const pieChartData = useMemo(() => {
    return [
      { name: "For Disposal", value: totals.forDisposalQty, fill: "#f97316" },
      {
        name: "Return to Warehouse",
        value: totals.returnWarehouseQty,
        fill: "#3b82f6",
      },
    ];
  }, [totals]);

  // --- Chronological Line Mapping Map ---
  const lineChartData = useMemo(() => {
    const trends: Record<
      string,
      { period: string; disposal: number; warehouse: number }
    > = {};

    filteredData
      .slice()
      .reverse()
      .forEach((rec) => {
        const dateKey = new Date(rec.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        const ticketItemSum = (rec.tbl_bo_input_items || []).reduce(
          (sum, item) => sum + (item.request_qty || 0),
          0,
        );

        if (!trends[dateKey]) {
          trends[dateKey] = { period: dateKey, disposal: 0, warehouse: 0 };
        }

        if (rec.workflow_type === "For Disposal") {
          trends[dateKey].disposal += ticketItemSum;
        }
        if (rec.workflow_type === "Return to Warehouse") {
          trends[dateKey].warehouse += ticketItemSum;
        }
      });

    return Object.values(trends).slice(-8);
  }, [filteredData]);

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
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bad Order Reclamation Report
          </h1>
          <p className="text-xs text-muted-foreground">
            Monitor inventory defects, dynamic routing distributions, and
            performance matrices.
          </p>
        </div>

        {/* Filters */}
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

      {/* --- KPI CARDS SECTION --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Bad Orders */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs bg-white">
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Bad Order Items
            </div>
            <div className="text-2xl font-black text-slate-900">
              {totals.totalItemQty.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({totals.totalTickets} Tickets)
              </span>
            </div>
          </div>
        </div>

        {/* Return to Warehouse */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs bg-white">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Return to Warehouse
            </div>
            <div className="text-2xl font-black text-blue-600">
              {totals.returnWarehouseQty.toLocaleString()}{" "}
              <span className="text-xs font-normal text-blue-400">items</span>
            </div>
          </div>
        </div>

        {/* For Disposal */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs bg-white">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              For Disposal
            </div>
            <div className="text-2xl font-black text-orange-600">
              {totals.forDisposalQty.toLocaleString()}{" "}
              <span className="text-xs font-normal text-orange-400">items</span>
            </div>
          </div>
        </div>

        {/* Pending Action */}
        <div className="bg-card p-4 rounded-xl border flex items-center gap-4 shadow-xs bg-white">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Pending Action
            </div>
            <div className="text-2xl font-black text-amber-500">
              {totals.pendingActionQty.toLocaleString()}{" "}
              <span className="text-xs font-normal text-amber-400">items</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- VISUALIZATIONS SECTION --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pure Recharts Donut Pie Canvas */}
        <div className="bg-card p-5 rounded-xl border flex flex-col justify-between space-y-4 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Workflow Proportions (Items)
              </h2>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Distribution ratio of total items across processing channels.
            </p>
          </div>

          <div className="h-44 w-full flex items-center justify-center py-2">
            {totals.totalItemQty > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={75}
                    paddingAngle={0}
                  >
                    {pieChartData.map((entry, index) => (
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

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 block" />
              <div>
                <span className="text-muted-foreground text-[10px] block">
                  For Disposal
                </span>
                <b className="font-mono text-slate-900">
                  {totals.forDisposalQty.toLocaleString()} pcs
                </b>
              </div>
            </div>
            <div className="flex items-center gap-2 border-l pl-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 block" />
              <div>
                <span className="text-muted-foreground text-[10px] block">
                  Warehouse Returns
                </span>
                <b className="font-mono text-slate-900">
                  {totals.returnWarehouseQty.toLocaleString()} pcs
                </b>
              </div>
            </div>
          </div>
        </div>

        {/* Pure Recharts Chronological Line Graph */}
        <div className="bg-card p-5 rounded-xl border space-y-4 lg:col-span-2 bg-white flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                Item Volume Influx Over Time
              </h2>
            </div>
          </div>

          <div className="h-52 w-full pt-4">
            {lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={lineChartData}
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
                    contentStyle={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                    labelStyle={{ fontSize: "11px", fontWeight: "bold" }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="disposal"
                    name="For Disposal"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="warehouse"
                    name="Return to Warehouse"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
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
    </div>
  );
}
