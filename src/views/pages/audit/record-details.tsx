import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  HardDrive,
  Calendar as CalendarIcon,
  DollarSign,
  UserCheck,
  FilterX,
  Filter,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import RequestTimeline from "@/components/custom/timeline";

interface DetailsProps {
  record: any;
  domain: "inventory" | "stt" | "bo";
  onBack: () => void;
}

type ExpirationStatus = "expired" | "near_expired" | "not_expired" | "no_date";

export default function RecordDetailsPage({
  record,
  domain,
  onBack,
}: DetailsProps) {
  // Filter States
  const [expirationFilter, setExpirationFilter] = useState<string>("all");
  const [expDateFrom, setExpDateFrom] = useState<string>("");
  const [expDateTo, setExpDateTo] = useState<string>("");

  if (!record) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">Log data stream parsing failed.</p>
        <Button onClick={onBack}>Return to Registry</Button>
      </div>
    );
  }

  const creatorName = record.user
    ? `${record.user.first_name || ""} ${record.user.last_name || ""}`.trim() ||
      record.user.email
    : "System Process Identity";

  // Utility: Calculate expiration status and days remaining
  const getExpirationMeta = (dateStr: string | null | undefined) => {
    if (!dateStr)
      return { status: "no_date" as ExpirationStatus, daysLeft: null };

    const expDate = new Date(dateStr);
    if (isNaN(expDate.getTime())) {
      return { status: "no_date" as ExpirationStatus, daysLeft: null };
    }

    const today = new Date();
    // Normalize time to compare pure dates
    today.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);

    const diffTime = expDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { status: "expired" as ExpirationStatus, daysLeft };
    } else if (daysLeft <= 30) {
      return { status: "near_expired" as ExpirationStatus, daysLeft };
    } else {
      return { status: "not_expired" as ExpirationStatus, daysLeft };
    }
  };

  // Process, Filter, and Sort Items
  const processedItems = useMemo(() => {
    const rawItems = record.items || [];

    // 1. Enrich with status & filter
    const filtered = rawItems.filter((item: any) => {
      const meta = getExpirationMeta(item.expiration_date);

      // Expiration Category Filter
      if (expirationFilter !== "all" && meta.status !== expirationFilter) {
        return false;
      }

      // Date Range Filter
      if (item.expiration_date) {
        const itemExp = new Date(item.expiration_date);
        if (expDateFrom) {
          const from = new Date(expDateFrom);
          from.setHours(0, 0, 0, 0);
          if (itemExp < from) return false;
        }
        if (expDateTo) {
          const to = new Date(expDateTo);
          to.setHours(23, 59, 59, 999);
          if (itemExp > to) return false;
        }
      } else if (expDateFrom || expDateTo) {
        // Exclude items without dates if date range filter is active
        return false;
      }

      return true;
    });

    // 2. Sort: Expired -> Nearly Expired -> Not Expired -> No Date
    const statusPriority: Record<ExpirationStatus, number> = {
      expired: 1,
      near_expired: 2,
      not_expired: 3,
      no_date: 4,
    };

    return filtered.sort((a: any, b: any) => {
      const metaA = getExpirationMeta(a.expiration_date);
      const metaB = getExpirationMeta(b.expiration_date);

      const priorityDiff =
        statusPriority[metaA.status] - statusPriority[metaB.status];
      if (priorityDiff !== 0) return priorityDiff;

      // Secondary Sort: Soonest expiring first within the same status category
      if (metaA.daysLeft !== null && metaB.daysLeft !== null) {
        return metaA.daysLeft - metaB.daysLeft;
      }

      return 0;
    });
  }, [record.items, expirationFilter, expDateFrom, expDateTo]);

  const isFiltered =
    expirationFilter !== "all" || expDateFrom !== "" || expDateTo !== "";

  const handleClearFilters = () => {
    setExpirationFilter("all");
    setExpDateFrom("");
    setExpDateTo("");
  };

  // Render Expiration Date Cell with Badges and Visual Warnings
  const renderExpirationCell = (dateStr: string | null | undefined) => {
    if (!dateStr) {
      return <span className="text-muted-foreground">—</span>;
    }

    const { status, daysLeft } = getExpirationMeta(dateStr);
    const formattedDate = new Date(dateStr).toLocaleDateString();

    if (status === "expired") {
      return (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="destructive"
            className="text-[10px] px-1.5 py-0.5 gap-1 font-mono uppercase tracking-wider"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Expired
          </Badge>
          <span className="text-xs font-semibold text-destructive">
            {formattedDate}
          </span>
        </div>
      );
    }

    if (status === "near_expired") {
      return (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0.5 gap-1 font-mono uppercase tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800"
          >
            <Clock className="h-3 w-3 shrink-0" />
            {daysLeft === 0 ? "Expires Today" : `In ${daysLeft} d`}
          </Badge>
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {formattedDate}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{formattedDate}</span>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-background p-6 lg:p-10 space-y-8 animate-in fade-in duration-200">
      {/* Header View */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors font-medium group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Registry List
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                {domain === "inventory" && (
                  <>{record.outlet_name || `Tracking Record Summary`}</>
                )}
                {domain === "stt" && (
                  <>{record.distributor_name || `Tracking Record Summary`}</>
                )}
                {domain === "bo" && (
                  <>{record.outlet_name || `Tracking Record Summary`}</>
                )}
              </h1>
              {domain === "stt" && <p>{record.outlet_name}</p>}
            </div>
            <Badge
              variant="outline"
              className="text-sm font-mono bg-muted py-0.5 px-2"
            >
              ID: {record.id}
            </Badge>
            <Badge className="bg-blue-600 dark:bg-blue-700 tracking-wider font-semibold text-xs uppercase">
              {domain === "bo" ? "Bad Order" : domain.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            BP Channel Code:
          </span>
          <Badge className="font-mono text-base px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
            {record.bp_code || "UNASSIGNED"}
          </Badge>
        </div>
      </div>

      {/* Parent Table Core Details Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-muted rounded-lg text-muted-foreground">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground block">
              System Log Date
            </span>
            <span className="font-semibold text-sm text-foreground">
              {new Date(record.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-muted rounded-lg text-muted-foreground">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground block">
              Author Identity
            </span>
            <span
              className="font-semibold text-sm text-foreground truncate max-w-[180px] block"
              title={record.user?.email || ""}
            >
              {creatorName}
            </span>
          </div>
        </div>

        {domain === "bo" && (
          <>
            <div className="p-4 rounded-xl border bg-card flex items-center gap-4 shadow-sm">
              <div className="p-3 bg-muted rounded-lg text-muted-foreground">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground block">
                  Total Valuation
                </span>
                <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                  ₱
                  {record.total_cost?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  }) || "0.00"}
                </span>
              </div>
            </div>
            <div className="p-4 rounded-xl border bg-card flex items-center gap-4 shadow-sm">
              <div className="p-3 bg-muted rounded-lg text-muted-foreground">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground block">
                  Workflow Route
                </span>
                <span className="font-semibold text-sm text-foreground">
                  {record.workflow_type || "Standard"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Manifest Specification Entries with Domain Specific Columns */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>Component Manifest Specifications</span>
            <Badge
              variant="secondary"
              className="rounded-full text-xs font-mono"
            >
              {processedItems.length} of {record.items?.length || 0} Line Items
            </Badge>
          </h2>

          {/* EXPIRATION FILTER CONTROLS BAR */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Expiration Status Dropdown */}
            <Select
              value={expirationFilter}
              onValueChange={(val) => setExpirationFilter(val)}
            >
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Expiration Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Expirations</SelectItem>
                <SelectItem value="expired">
                  <span className="flex items-center gap-1.5 text-destructive font-medium">
                    <AlertTriangle className="h-3 w-3" /> Expired
                  </span>
                </SelectItem>
                <SelectItem value="near_expired">
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="h-3 w-3" /> Nearly Expired
                  </span>
                </SelectItem>
                <SelectItem value="not_expired">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> Not Expired
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 border-dashed text-xs"
                >
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    {expDateFrom || expDateTo
                      ? `${expDateFrom || "Start"} to ${expDateTo || "End"}`
                      : "Expiration Date Range"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4 space-y-3" align="end">
                <div className="space-y-1">
                  <h4 className="font-medium text-xs text-muted-foreground">
                    Filter by Expiration Date
                  </h4>
                </div>
                <div className="grid gap-2">
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">
                      Expiration From
                    </label>
                    <Input
                      type="date"
                      value={expDateFrom}
                      onChange={(e) => setExpDateFrom(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">
                      Expiration To
                    </label>
                    <Input
                      type="date"
                      value={expDateTo}
                      onChange={(e) => setExpDateTo(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear Filters Button */}
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <FilterX className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[140px] font-semibold">
                  SKU / Code
                </TableHead>
                <TableHead className="font-semibold">
                  Description Label
                </TableHead>

                {/* INVENTORY Context Headings */}
                {domain === "inventory" && (
                  <>
                    <TableHead className="text-right font-semibold">
                      Current Qty
                    </TableHead>
                    <TableHead className="font-semibold pl-6">
                      Expiration Date
                    </TableHead>
                  </>
                )}

                {/* STT Context Headings */}
                {domain === "stt" && (
                  <TableHead className="text-right font-semibold">
                    Qty
                  </TableHead>
                )}

                {/* BAD ORDER (BO) Context Headings */}
                {domain === "bo" && (
                  <>
                    <TableHead className="text-right font-semibold">
                      Req Qty
                    </TableHead>
                    <TableHead className="text-right font-semibold">
                      Actual Qty
                    </TableHead>
                    <TableHead className="font-semibold pl-4">
                      Reason / Remarks
                    </TableHead>
                    <TableHead className="font-mono text-xs font-semibold">
                      RGS Num
                    </TableHead>
                    <TableHead className="font-semibold">
                      Expiration Date
                    </TableHead>
                  </>
                )}

                <TableHead className="text-right w-[100px] font-semibold">
                  UOM
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedItems && processedItems.length > 0 ? (
                processedItems.map((item: any) => {
                  const { status } = getExpirationMeta(item.expiration_date);

                  // Row Background Highlighting for Expired / Near Expired
                  let rowHighlightClass =
                    "hover:bg-muted/10 h-14 transition-colors";
                  if (status === "expired") {
                    rowHighlightClass =
                      "bg-red-500/10 hover:bg-red-500/15 border-l-4 border-l-destructive h-14 transition-colors";
                  } else if (status === "near_expired") {
                    rowHighlightClass =
                      "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500 h-14 transition-colors";
                  }

                  return (
                    <TableRow key={item.id} className={rowHighlightClass}>
                      <TableCell className="font-mono text-xs font-bold text-muted-foreground tracking-wide">
                        {item.item_code}
                      </TableCell>
                      <TableCell
                        className="text-sm font-medium text-foreground max-w-[200px] truncate"
                        title={item.item_description}
                      >
                        {item.item_description}
                      </TableCell>

                      {/* INVENTORY Conditional Data Grid Cells */}
                      {domain === "inventory" && (
                        <>
                          <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                            {item.qty ?? 0}
                          </TableCell>
                          <TableCell className="pl-6">
                            {renderExpirationCell(item.expiration_date)}
                          </TableCell>
                        </>
                      )}

                      {/* STT Conditional Data Grid Cells */}
                      {domain === "stt" && (
                        <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                          {item.qty ?? 0}
                        </TableCell>
                      )}

                      {/* BAD ORDER Conditional Data Grid Cells */}
                      {domain === "bo" && (
                        <>
                          <TableCell className="text-right font-mono font-medium text-sm text-muted-foreground">
                            {item.request_qty ?? 0}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                            {item.actual_qty ?? "—"}
                          </TableCell>
                          <TableCell
                            className="text-xs max-w-[160px] truncate pl-4 text-muted-foreground"
                            title={item.reason || item.remarks}
                          >
                            <span className="text-foreground font-medium block">
                              {item.reason || "—"}
                            </span>
                            {item.remarks && (
                              <span className="text-[11px] block text-muted-foreground truncate">
                                {item.remarks}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.rgs_number || "—"}
                          </TableCell>
                          <TableCell>
                            {renderExpirationCell(item.expiration_date)}
                          </TableCell>
                        </>
                      )}

                      <TableCell className="text-right text-xs uppercase font-semibold text-muted-foreground">
                        {item.uom || "PCS"}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-16 text-muted-foreground italic text-sm"
                  >
                    No component manifest entries matched the active expiration
                    filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {domain === "bo" && <RequestTimeline badOrderId={record.id} />}
      </div>
    </div>
  );
}
