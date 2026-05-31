import React, { useState, useMemo, useEffect } from "react";
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
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  CalendarRange,
  Filter,
  Building2,
  ChevronsUpDown,
  X,
  Search,
} from "lucide-react";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";

interface AuditLineItem {
  bp_code: string;
  item_code: string;
  item_description: string;
  uom: string;
  expected_qty: number;
  physical_qty: number;
  variance_count: number;
  expiration_date?: string;
  created_at?: string;
}

interface BusinessPartner {
  bp_code: string;
  customer_name: string;
}

type TimeframeFilter = "ALL" | "DAY" | "MONTH";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function ValidatedAuditDiscrepancyReport() {
  const mainDbClient = supabaseClients["sales.server.main"];
  const extDbClient = supabaseClients["sales.server.extension"];

  // Core Search & Context States
  const [outletCode, setOutletCode] = useState<string>("");
  const [outletName, setOutletName] = useState<string>("");
  const [outletInput, setOutletInput] = useState<string>("");
  const debouncedOutletSearch = useDebounce<string>(outletInput, 300);
  const [outlets, setOutlets] = useState<BusinessPartner[]>([]);

  // Discrepancy Record States
  const [reportData, setReportData] = useState<AuditLineItem[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState<boolean>(false);

  // Layout Controls
  const [isOutletComboOpen, setIsOutletComboOpen] = useState<boolean>(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("ALL");

  // --- HOOK: OUTLET AUTOCOMPLETE LOOKUP ENGINE ---
  useEffect(() => {
    async function fetchOutlets(): Promise<void> {
      const query = debouncedOutletSearch.trim();
      if (query.length < 2) {
        setOutlets([]);
        return;
      }
      setIsSearchingOutlets(true);
      try {
        const { data, error } = await extDbClient
          .from("bpmd")
          .select("bp_code, customer_name")
          .or(`customer_name.ilike.%${query}%,bp_code.ilike.%${query}%`)
          .limit(10);
        if (error) throw error;
        setOutlets((data as BusinessPartner[]) || []);
      } catch (err) {
        console.error("Context evaluation filtering error:", err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }
    void fetchOutlets();
  }, [debouncedOutletSearch, extDbClient]);

  // --- HOOK: MATCH DATA DISCREPANCIES TO SELECTIVE BP_CODE ---
  useEffect(() => {
    async function fetchDiscrepancies() {
      if (!outletCode) {
        setReportData([]);
        return;
      }

      setIsLoadingLedger(true);
      try {
        // Restricted to the single latest parent record using order and limit modifiers
        const { data, error } = await mainDbClient
          .from("tbl_inventory_audits")
          .select(
            `
            bp_code,
            created_at,
            items:tbl_inventory_audit_items (
              item_code,
              item_description,
              uom,
              expected_qty,
              physical_qty,
              variance_count,
              expiration_date
            )
          `,
          )
          .eq("bp_code", outletCode)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) throw error;

        const flattenedItems: AuditLineItem[] = [];

        // Extract from index 0 since we limited our server payload return array to 1 record maximum
        if (data && data.length > 0) {
          const latestAudit = data[0];
          const childItems = latestAudit.items || [];

          childItems.forEach((item: any) => {
            flattenedItems.push({
              bp_code: latestAudit.bp_code,
              item_code: item.item_code,
              item_description: item.item_description,
              uom: item.uom,
              expected_qty: Number(item.expected_qty || 0),
              physical_qty: Number(item.physical_qty || 0),
              variance_count: Number(item.variance_count || 0),
              expiration_date: item.expiration_date,
              created_at: latestAudit.created_at,
            });
          });
        }

        setReportData(flattenedItems);
      } catch (err: any) {
        console.error("Error retrieving ledger adjustments:", err);
        toast.error("Failed to fetch discrepancies for the selected profile.");
      } finally {
        setIsLoadingLedger(false);
      }
    }

    void fetchDiscrepancies();
  }, [outletCode, mainDbClient]);

  // 1. Timeframe Filter Engine
  const filteredData = useMemo(() => {
    const now = new Date();

    return reportData.filter((line) => {
      if (timeframe === "ALL") return true;
      if (!line.created_at) return true;

      const recordDate = new Date(line.created_at);

      if (timeframe === "DAY") {
        return recordDate.toDateString() === now.toDateString();
      }

      if (timeframe === "MONTH") {
        return (
          recordDate.getMonth() === now.getMonth() &&
          recordDate.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  }, [reportData, timeframe]);

  // 2. Summary Metric Matrix Engine
  const reportMetrics = useMemo(() => {
    let totalExpected = 0;
    let totalPhysical = 0;
    let totalDiscrepanciesCount = 0;
    let totalShortageUnits = 0;

    filteredData.forEach((line) => {
      totalExpected += line.expected_qty;
      totalPhysical += line.physical_qty;
      if (line.variance_count !== 0) {
        totalDiscrepanciesCount++;
        if (line.variance_count < 0) {
          totalShortageUnits += Math.abs(line.variance_count);
        }
      }
    });

    return {
      totalExpected,
      totalPhysical,
      totalDiscrepanciesCount,
      totalShortageUnits,
    };
  }, [filteredData]);

  const handleClearProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOutletCode("");
    setOutletName("");
    setOutletInput("");
  };

  return (
    <div className="w-full space-y-6">
      {/* FILTER & MASTER CONSOLE SELECTION BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 p-4 rounded-lg border">
        {/* OUTLET INTERFACE SEARCH CONTROLLER */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-indigo-600" /> Active
            Business Profile
          </Label>
          <Popover open={isOutletComboOpen} onOpenChange={setIsOutletComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between font-normal text-xs text-left truncate bg-white h-9 relative pr-8"
              >
                <span className="truncate">
                  {outletName
                    ? `${outletName} (${outletCode})`
                    : "Select an active profile to load audit logs..."}
                </span>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-white">
                  {outletCode && (
                    <span
                      onClick={handleClearProfile}
                      className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 text-slate-500" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Type customer name or code..."
                  value={outletInput}
                  onValueChange={setOutletInput}
                />
                <CommandList>
                  {isSearchingOutlets && (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Filtering records registry...
                    </div>
                  )}
                  {!isSearchingOutlets && outlets.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400 italic">
                      Type at least 2 characters to look up profile...
                    </div>
                  )}
                  <CommandGroup>
                    {outlets.map((partner) => (
                      <CommandItem
                        key={partner.bp_code}
                        onSelect={() => {
                          setOutletCode(partner.bp_code);
                          setOutletName(partner.customer_name);
                          setIsOutletComboOpen(false);
                        }}
                        className="cursor-pointer text-xs"
                      >
                        {partner.customer_name} ({partner.bp_code})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* TIMEFRAME SELECTION BAR */}
        <div className="md:col-span-1 flex flex-col gap-1.5">
          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-indigo-600" /> Window Context
          </Label>
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-md border h-9">
            <Button
              size="sm"
              disabled={!outletCode}
              variant={timeframe === "ALL" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("ALL")}
            >
              All-Time
            </Button>
            <Button
              size="sm"
              disabled={!outletCode}
              variant={timeframe === "DAY" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("DAY")}
            >
              Today
            </Button>
            <Button
              size="sm"
              disabled={!outletCode}
              variant={timeframe === "MONTH" ? "default" : "ghost"}
              className="h-7 text-xs flex-1 font-semibold"
              onClick={() => setTimeframe("MONTH")}
            >
              Month
            </Button>
          </div>
        </div>
      </div>

      {/* HIGHLIGHT EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Total Expected Load
              </p>
              <h3 className="text-xl font-mono font-bold text-slate-800 mt-1">
                {reportMetrics.totalExpected}
              </h3>
            </div>
            <div className="p-2 bg-slate-100 rounded-md text-slate-600">
              <CalendarRange className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Physical Counted
              </p>
              <h3 className="text-xl font-mono font-bold text-indigo-600 mt-1">
                {reportMetrics.totalPhysical}
              </h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-md text-indigo-600">
              <BarChart3 className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                SKUs with Variance
              </p>
              <h3 className="text-xl font-mono font-bold text-amber-600 mt-1">
                {reportMetrics.totalDiscrepanciesCount}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 rounded-md text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Total Net Stock Deficit
              </p>
              <h3 className="text-xl font-mono font-bold text-rose-600 mt-1">
                {reportMetrics.totalShortageUnits}
              </h3>
            </div>
            <div className="p-2 bg-rose-50 rounded-md text-rose-600">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SHADCN TABLE PRIMITIVE MATRIX */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 border-b bg-slate-50/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Latest Inventory Discrepancy Ledger
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                {outletName
                  ? `Showing items matching the absolute latest audit profile for: ${outletName}`
                  : "Please select a business configuration profile from the console above to map analytics workflow."}
              </CardDescription>
            </div>
            {outletCode && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono px-2 py-0.5"
              >
                Tracking {filteredData.length} SKUs
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!outletCode ? (
            <div className="m-4 h-64 flex flex-col justify-center items-center gap-2 text-slate-400 border border-dashed rounded-lg bg-slate-50/40">
              <Search className="h-6 w-6 text-slate-300 animate-pulse" />
              <span className="text-xs font-medium text-slate-400">
                Awaiting Business Partner Assignment Selection...
              </span>
            </div>
          ) : isLoadingLedger ? (
            <div className="h-64 w-full flex flex-col justify-center items-center gap-2 text-slate-400">
              <span className="text-xs font-mono animate-pulse">
                Loading active ledger components from database...
              </span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="m-4 h-64 flex flex-col justify-center items-center gap-2 text-slate-400 border border-dashed rounded-lg bg-slate-50/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <span className="text-xs font-medium font-mono text-slate-500">
                No active records flagged inside this filtered parameter.
              </span>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="font-mono text-xs">
                <TableHeader className="bg-slate-50/70">
                  <TableRow className="uppercase tracking-wider text-[10px] font-bold">
                    <TableHead className="w-[120px] pl-4">SKU Ref</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center w-[80px]">UOM</TableHead>
                    <TableHead className="text-right w-[100px]">
                      Expected
                    </TableHead>
                    <TableHead className="text-right w-[100px]">
                      Physical
                    </TableHead>
                    <TableHead className="text-right w-[100px] pr-4">
                      Variance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((line, idx) => {
                    const hasVariance = line.variance_count !== 0;
                    const isShortage = line.variance_count < 0;

                    return (
                      <TableRow
                        key={`${line.item_code}-${idx}`}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell className="font-semibold text-slate-900 pl-4">
                          {line.item_code}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-sans text-slate-600">
                          {line.item_description}
                        </TableCell>
                        <TableCell className="text-center text-slate-400 text-[11px]">
                          {line.uom || "PCS"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-500">
                          {line.expected_qty}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-indigo-600">
                          {line.physical_qty}
                        </TableCell>
                        <TableCell
                          className={`text-right pr-4 font-bold ${
                            !hasVariance
                              ? "text-slate-400"
                              : isShortage
                                ? "text-rose-600"
                                : "text-amber-600"
                          }`}
                        >
                          {hasVariance && !isShortage
                            ? `+${line.variance_count}`
                            : line.variance_count}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
