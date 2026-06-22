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
import {
  ArrowLeft,
  HardDrive,
  Calendar,
  DollarSign,
  UserCheck,
} from "lucide-react";
import RequestTimeline from "@/components/custom/timeline";

interface DetailsProps {
  record: any;
  domain: "inventory" | "stt" | "bo";
  onBack: () => void;
}

export default function RecordDetailsPage({
  record,
  domain,
  onBack,
}: DetailsProps) {
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
                {domain == "inventory" && (
                  <>{record.outlet_name || `Tracking Record Summary`}</>
                )}
                {domain == "stt" && (
                  <>{record.distributor_name || `Tracking Record Summary`}</>
                )}
                {domain == "bo" && (
                  <>{record.outlet_name || `Tracking Record Summary`}</>
                )}
              </h1>
              {domain == "stt" && <p>{record.outlet_name}</p>}
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
            <Calendar className="h-5 w-5" />
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
      <div className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Component Manifest Specifications</span>
          <Badge variant="secondary" className="rounded-full text-xs font-mono">
            {record.items?.length || 0} Line Items
          </Badge>
        </h2>

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
                  <>
                    <TableHead className="text-right font-semibold">
                      Qty
                    </TableHead>
                  </>
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
              {record.items && record.items.length > 0 ? (
                record.items.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-muted/10 h-14">
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
                        <TableCell className="text-xs text-muted-foreground pl-6">
                          {item.expiration_date
                            ? new Date(
                                item.expiration_date,
                              ).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </>
                    )}

                    {/* STT Conditional Data Grid Cells */}
                    {domain === "stt" && (
                      <>
                        <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                          {item.qty ?? 0}
                        </TableCell>
                      </>
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
                        <TableCell
                          className="text-xs text-muted-foreground italic max-w-[140px] truncate"
                          title={item.expiration_date}
                        >
                          {item.expiration_date || "—"}
                        </TableCell>
                      </>
                    )}

                    <TableCell className="text-right text-xs uppercase font-semibold text-muted-foreground">
                      {item.uom || "PCS"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-16 text-muted-foreground italic text-sm"
                  >
                    No individual manifest component entities mapped under this
                    tracking log.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {domain == "bo" && <RequestTimeline badOrderId={record.id} />}
      </div>
    </div>
  );
}
