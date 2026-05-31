import React, { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Area,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  AlertTriangle,
  User,
  ShieldAlert,
  Activity,
  ShoppingBag,
  PackageX,
  Filter,
} from "lucide-react";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";

// --- INTERFACES MATCHING LIVE SCHEMA ---
interface EmployeeProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_active: boolean | null;
}

interface ConsolidatedKpiLog {
  date_key: string; // Grouping identifier (Day string or Month label)
  stt_volume: number; // Sum of qty from tbl_stt_items
  bad_orders_count: number; // Count of records from tbl_bo_input
  bad_orders_cost: number; // Sum of total_cost from tbl_bo_input
  discrepancies_count: number; // Sum of variance_count absolute values
}

type TimeframeFilter = "ALL" | "DAY" | "MONTH";

export default function EmployeeKpiDashboard() {
  const { employee_id } = useParams<{ employee_id: string }>();
  const mainDbClient = supabaseClients["sales.server.main"];

  // Core Functional States
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [dbTimelineLogs, setDbTimelineLogs] = useState<ConsolidatedKpiLog[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("ALL");

  // --- DATABASE ACQUISITION LAYER ---
  useEffect(() => {
    async function fetchSchemaMetrics() {
      if (!employee_id) return;
      setIsLoading(true);
      try {
        // 1. Fetch employee record from tbl_employees
        const { data: empData, error: empError } = await mainDbClient
          .from("tbl_employees")
          .select("id, first_name, last_name, email, is_active")
          .eq("id", employee_id)
          .single();

        if (empError) throw empError;
        setProfile(empData as EmployeeProfile);

        // 2. Fetch Bad Orders data from tbl_bo_input
        const { data: boData, error: boError } = await mainDbClient
          .from("tbl_bo_input")
          .select("created_at, total_cost")
          .eq("user_id", employee_id);
        if (boError) throw boError;

        // 3. Fetch Sales to Trade records from parent -> child items
        const { data: sttData, error: sttError } = await mainDbClient
          .from("tbl_stt")
          .select("created_at, tbl_stt_items(qty)")
          .eq("user_id", employee_id);
        if (sttError) throw sttError;

        // 4. Fetch Inventory Audit Discrepancies via audited_by reference pointer
        const { data: auditData, error: auditError } = await mainDbClient
          .from("tbl_inventory_audits")
          .select("created_at, tbl_inventory_audit_items(variance_count)")
          .eq("audited_by", employee_id);
        if (auditError) throw auditError;

        // --- PRODUCTION LOGS AGGREGATION MAPPER ---
        // Consolidate separate transactional arrays into a uniform analytical timeline
        const timelineMap: Record<string, ConsolidatedKpiLog> = {};

        const getGroupKey = (dateStr: string) => {
          const d = new Date(dateStr);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };

        // Map Bad Orders
        boData?.forEach((row) => {
          const key = getGroupKey(row.created_at);
          if (!timelineMap[key]) {
            timelineMap[key] = {
              date_key: key,
              stt_volume: 0,
              bad_orders_count: 0,
              bad_orders_cost: 0,
              discrepancies_count: 0,
            };
          }
          timelineMap[key].bad_orders_count += 1;
          timelineMap[key].bad_orders_cost += row.total_cost || 0;
        });

        // Map Sales to Trade volumes
        sttData?.forEach((row) => {
          const key = getGroupKey(row.created_at);
          if (!timelineMap[key]) {
            timelineMap[key] = {
              date_key: key,
              stt_volume: 0,
              bad_orders_count: 0,
              bad_orders_cost: 0,
              discrepancies_count: 0,
            };
          }
          const itemSum = Array.isArray(row.tbl_stt_items)
            ? row.tbl_stt_items.reduce(
                (acc: number, item: any) => acc + (Number(item.qty) || 0),
                0,
              )
            : 0;
          timelineMap[key].stt_volume += itemSum;
        });

        // Map Audit Variance Discrepancies
        auditData?.forEach((row) => {
          const key = getGroupKey(row.created_at);
          if (!timelineMap[key]) {
            timelineMap[key] = {
              date_key: key,
              stt_volume: 0,
              bad_orders_count: 0,
              bad_orders_cost: 0,
              discrepancies_count: 0,
            };
          }
          const varianceSum = Array.isArray(row.tbl_inventory_audit_items)
            ? row.tbl_inventory_audit_items.reduce(
                (acc: number, item: any) =>
                  acc + Math.abs(item.variance_count || 0),
                0,
              )
            : 0;
          timelineMap[key].discrepancies_count += varianceSum;
        });

        // Sort payload sequentially
        const sortedTimeline = Object.values(timelineMap).sort(
          (a, b) =>
            new Date(a.date_key).getTime() - new Date(b.date_key).getTime(),
        );

        setDbTimelineLogs(sortedTimeline);
      } catch (err: any) {
        console.error("Live schema mapping extraction error:", err);
        toast.error("Failed to generate employee KPI metric profiles.");
      } finally {
        setIsLoading(false);
      }
    }

    void fetchSchemaMetrics();
  }, [employee_id, mainDbClient]);

  // --- TIMEFRAME CALCULATOR SCOPE ENGINE ---
  const filteredTimeline = useMemo(() => {
    const now = new Date();
    return dbTimelineLogs.filter((row) => {
      if (timeframe === "ALL") return true;
      const rowDate = new Date(row.date_key);

      if (timeframe === "DAY") {
        return rowDate.toDateString() === now.toDateString();
      }
      if (timeframe === "MONTH") {
        return (
          rowDate.getMonth() === now.getMonth() &&
          rowDate.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  }, [dbTimelineLogs, timeframe]);

  // --- COMPOSITE STOPLIGHT RULE CRITERIA LOGIC ---
  const stoplightAnalysis = useMemo(() => {
    let aggregateSttVolume = 0;
    let aggregateBadOrders = 0;
    let aggregateDiscrepancies = 0;

    filteredTimeline.forEach((row) => {
      aggregateSttVolume += row.stt_volume;
      aggregateBadOrders += row.bad_orders_count;
      aggregateDiscrepancies += row.discrepancies_count;
    });

    // Custom operational alert logic models based on timeframes
    let sttStatus: "GREEN" | "AMBER" | "RED" = "GREEN";
    let boStatus: "GREEN" | "AMBER" | "RED" = "GREEN";
    let discStatus: "GREEN" | "AMBER" | "RED" = "GREEN";

    if (timeframe === "DAY") {
      if (aggregateSttVolume < 10) sttStatus = "RED";
      else if (aggregateSttVolume < 30) sttStatus = "AMBER";

      if (aggregateBadOrders > 3) boStatus = "RED";
      else if (aggregateBadOrders > 0) boStatus = "AMBER";

      if (aggregateDiscrepancies > 5) discStatus = "RED";
      else if (aggregateDiscrepancies > 1) discStatus = "AMBER";
    } else {
      // Month / All-time multi-log scaling boundaries
      if (aggregateSttVolume < 150) sttStatus = "RED";
      else if (aggregateSttVolume < 400) sttStatus = "AMBER";

      if (aggregateBadOrders > 15) boStatus = "RED";
      else if (aggregateBadOrders > 5) boStatus = "AMBER";

      if (aggregateDiscrepancies > 25) discStatus = "RED";
      else if (aggregateDiscrepancies > 8) discStatus = "AMBER";
    }

    const valueWeights = { GREEN: 3, AMBER: 2, RED: 1 };
    const compositeIndex =
      (valueWeights[sttStatus] +
        valueWeights[boStatus] +
        valueWeights[discStatus]) /
      3;

    return {
      aggregateSttVolume,
      aggregateBadOrders,
      aggregateDiscrepancies,
      sttStatus,
      boStatus,
      discStatus,
      compositeIndex,
    };
  }, [filteredTimeline, timeframe]);

  const getStatusBadgeStyles = (status: "GREEN" | "AMBER" | "RED") => {
    switch (status) {
      case "GREEN":
        return "bg-emerald-500 text-white border-emerald-600";
      case "AMBER":
        return "bg-amber-500 text-slate-900 border-amber-600";
      case "RED":
        return "bg-rose-500 text-white border-rose-600";
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-2">
        <Activity className="h-6 w-6 text-indigo-600 animate-spin" />
        <span className="text-xs font-mono text-slate-400">
          Querying live data ledgers...
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full p-8 text-center border border-dashed rounded-lg bg-slate-50">
        <ShieldAlert className="h-8 w-8 text-rose-500 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-800">
          No Target Employee Found
        </h4>
        <p className="text-xs text-slate-400 mt-1">
          The provided ID `{employee_id}` does not match an active user.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* EMPLOYEE CONTEXT CARD & TIMEFRAME TOGGLE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-5 rounded-xl border shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {profile.first_name} {profile.last_name}
            </h2>
            <p className="text-xs text-slate-400">
              {profile.email} &bull;{" "}
              <span className="font-semibold text-slate-600">
                Operations Field Force
              </span>
            </p>
          </div>
        </div>

        {/* TIME CONTROLS */}
        <div className="flex flex-col gap-1 w-full lg:w-auto min-w-[260px]">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Filter className="h-3 w-3 text-indigo-600" /> Operational
            Assessment Scope
          </Label>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border h-9">
            <Button
              size="sm"
              variant={timeframe === "ALL" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("ALL")}
            >
              All-Time
            </Button>
            <Button
              size="sm"
              variant={timeframe === "MONTH" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("MONTH")}
            >
              Month
            </Button>
            <Button
              size="sm"
              variant={timeframe === "DAY" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("DAY")}
            >
              Today
            </Button>
          </div>
        </div>
      </div>

      {/* STOPLIGHT INDEX METRIC DISPLAY BLOCK */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* COMPOSITE VISUAL STOPLIGHT TRACKER */}
        <Card className="shadow-sm bg-slate-900 text-white flex flex-col justify-between p-5 md:col-span-1">
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
              Operational Health
            </p>
            <h4 className="text-xs font-bold text-slate-200 mt-0.5">
              Stoplight KPI Index
            </h4>
          </div>
          <div className="py-2 flex justify-center">
            <div className="flex flex-col gap-2.5 bg-slate-800 p-3 rounded-full border border-slate-700 shadow-xl">
              <div
                className={`h-7 w-7 rounded-full transition-all duration-300 ${stoplightAnalysis.compositeIndex >= 2.5 ? "bg-emerald-500 shadow-[0_0_14px_#10b981]" : "bg-emerald-950/30"}`}
              />
              <div
                className={`h-7 w-7 rounded-full transition-all duration-300 ${stoplightAnalysis.compositeIndex >= 1.6 && stoplightAnalysis.compositeIndex < 2.5 ? "bg-amber-400 shadow-[0_0_14px_#f59e0b]" : "bg-amber-950/30"}`}
              />
              <div
                className={`h-7 w-7 rounded-full transition-all duration-300 ${stoplightAnalysis.compositeIndex < 1.6 ? "bg-rose-500 shadow-[0_0_14px_#f43f5e]" : "bg-rose-950/30"}`}
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center italic">
            Aggregate metric performance stoplight status.
          </p>
        </Card>

        {/* METRIC 1: SALES TO TRADE VOLUME */}
        <Card className="shadow-sm border-t-4 border-t-indigo-500">
          <CardContent className="p-4 pt-5 flex flex-col justify-between h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3 text-indigo-500" /> Sales To
                  Trade (STT)
                </p>
                <h3 className="text-2xl font-mono font-bold text-slate-800 mt-1">
                  {stoplightAnalysis.aggregateSttVolume}{" "}
                  <span className="text-xs font-sans text-slate-400">
                    Units
                  </span>
                </h3>
              </div>
              <Badge
                className={`text-[9px] font-bold ${getStatusBadgeStyles(stoplightAnalysis.sttStatus)}`}
              >
                {stoplightAnalysis.sttStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Total product volume allocated via trade fulfillment inventories.
            </p>
          </CardContent>
        </Card>

        {/* METRIC 2: BAD ORDERS ACCUMULATION */}
        <Card className="shadow-sm border-t-4 border-t-rose-500">
          <CardContent className="p-4 pt-5 flex flex-col justify-between h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <PackageX className="h-3 w-3 text-rose-500" /> Bad Orders (BO)
                </p>
                <h3 className="text-2xl font-mono font-bold text-slate-800 mt-1">
                  {stoplightAnalysis.aggregateBadOrders}{" "}
                  <span className="text-xs font-sans text-slate-400">
                    Claims
                  </span>
                </h3>
              </div>
              <Badge
                className={`text-[9px] font-bold ${getStatusBadgeStyles(stoplightAnalysis.boStatus)}`}
              >
                {stoplightAnalysis.boStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Total returns, damages, or expiries logged across accounts.
            </p>
          </CardContent>
        </Card>

        {/* METRIC 3: INVENTORY VARIANCE COUNTS */}
        <Card className="shadow-sm border-t-4 border-t-amber-500">
          <CardContent className="p-4 pt-5 flex flex-col justify-between h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Audited
                  Discrepancies
                </p>
                <h3 className="text-2xl font-mono font-bold text-slate-800 mt-1">
                  {stoplightAnalysis.aggregateDiscrepancies}{" "}
                  <span className="text-xs font-sans text-slate-400">
                    Units
                  </span>
                </h3>
              </div>
              <Badge
                className={`text-[9px] font-bold ${getStatusBadgeStyles(stoplightAnalysis.discStatus)}`}
              >
                {stoplightAnalysis.discStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Absolute unit divergence during physical verification audits.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RECHARTS PERFORMANCE CHARTS CORE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GRAPH 1: SALES TO TRADE METRIC VOLUMES */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2 border-b bg-slate-50/30">
            <CardTitle className="text-xs uppercase font-bold text-slate-500 tracking-wide">
              Sales to Trade Movement Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            {filteredTimeline.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400 font-mono italic border border-dashed rounded-lg">
                No performance records mapped inside this context window.
              </div>
            ) : (
              <div className="h-64 w-full text-xs font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={filteredTimeline}
                    margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date_key"
                      stroke="#94a3b8"
                      tickLine={false}
                    />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#fff", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="stt_volume"
                      name="STT Stock Output Qty"
                      fill="#4f46e5"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GRAPH 2: COMBINED COMPLIANCE EXPOSURES RISK VECTOR CHART */}
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader className="pb-2 border-b bg-slate-50/30">
            <CardTitle className="text-xs uppercase font-bold text-slate-500 tracking-wide">
              Risk & Quality Deviations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            {filteredTimeline.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400 font-mono italic border border-dashed rounded-lg">
                No active tracking records logged.
              </div>
            ) : (
              <div className="h-64 w-full text-xs font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={filteredTimeline}
                    margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date_key"
                      stroke="#94a3b8"
                      tickLine={false}
                    />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#fff", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Area
                      type="monotone"
                      dataKey="bad_orders_count"
                      name="BO Count"
                      fill="#ffe4e6"
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="discrepancies_count"
                      name="Audit Discrepancies"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
