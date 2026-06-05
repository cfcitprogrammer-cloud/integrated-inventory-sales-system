// pages/bad-orders/AccountingReturnWarehouseDetailsPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Banknote,
} from "lucide-react";
import { supabase } from "@/config/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RequestTimeline from "@/components/custom/timeline";
import {
  emailNotifierUtil,
  type DisposalRequestPayload,
} from "@/lib/email-notifier";
import { toast } from "sonner";

export default function AccountingViewReturnWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);

  // Tracks the macro-level overall financial valuation
  const [totalCost, setTotalCost] = useState<number | "">("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Helper flag to verify if accounting metrics have already been posted
  const isAlreadyCosted =
    ticket?.total_cost !== null && ticket?.total_cost !== undefined;

  // Master tracking variable to determine if ticket is out of active lifecycle stages
  const isTerminated = ticket?.status === "Closed";

  // Core Financial Data Fetch Engine
  async function fetchDetailedData() {
    if (!id) return;
    try {
      setIsLoading(true);
      const ticketRes = await supabase()
        .from("tbl_bo_input")
        .select(
          `
    *,
    tbl_employees (
      first_name,
      last_name,
      email
    )
  `,
        )
        .eq("id", id)
        .single();

      const itemsRes = await supabase()
        .from("tbl_bo_input_items")
        .select("*")
        .eq("bo_input_id", id);

      const attachRes = await supabase()
        .from("tbl_bo_attachments")
        .select("*")
        .eq("bo_input_id", id);

      const currentTicket = ticketRes.data;
      setTicket(currentTicket);
      setItems(itemsRes.data || []);
      setAttachments(attachRes.data || []);

      // If cost exists in DB, populate it; otherwise leave empty for entry
      if (currentTicket && currentTicket.total_cost !== null) {
        setTotalCost(currentTicket.total_cost);
      }
    } catch (err) {
      console.error(
        "Failed loading accounting valuation manifest matrix hooks:",
        err,
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchDetailedData();
  }, [id, refreshNonce]);

  // Handle financial currency numeric boundaries securely
  const handleCostChange = (val: string) => {
    if (val === "") {
      setTotalCost("");
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setTotalCost(parsed);
    }
  };

  // Packages state data into structured utility contract payloads for Apps Script
  const handleOutboundNotification = () => {
    const parsedAttachments = attachments.map((a) => ({
      name: a.file_path.split("/").pop() || "Evidence_Attachment",
      url: supabase()
        .storage.from("bad-orders-attachments")
        .getPublicUrl(a.file_path).data.publicUrl,
    }));

    const alertPayload: DisposalRequestPayload = {
      requestId: String(ticket.id),
      customerName: ticket.outlet_name || "Unknown Outlet",
      bpCode: ticket.bp_code || "N/A",
      status: `Accounting Ledger Balanced - Total Valuation PHP ${Number(totalCost).toFixed(2)}`,
      dateTime: new Date().toISOString(),
      remarks: ticket.remarks || "",
      filer: {
        first_name: ticket.tbl_employees?.first_name || "System",
        last_name: ticket.tbl_employees?.last_name || "Filer",
      },
      items: items.map((i) => ({
        item_code: i.item_code,
        item_description: i.item_description,
        uom: i.uom || "PCS",
        request_qty: Number(i.request_qty),
        actual_qty: i.actual_qty !== null ? Number(i.actual_qty) : undefined,
        expiration_date: i.expiration_date,
        reason: i.reason,
        // Carry localized variables upward through outbound data paths
        rgs_number: i.rgs_number || "N/A",
        logistics_remarks: i.logistics_remarks || "None",
      })),
      attachments: parsedAttachments,
    };

    // Step 3 Hook: Dispatch alert validation packet upwards to GM sign-off queue
    emailNotifierUtil.sendReturnToWHToAGM(alertPayload);
  };

  // Accounting Transactional Execution Engine
  async function handleFinancialSubmission() {
    if (totalCost === "") {
      toast.error(
        "Financial tracking error: Please provide a valid Total Document Cost.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const timestampIso = new Date().toISOString();

      // 1. Update the overall total cost directly inside the parent ticket entry
      const { error: ticketUpdateError } = await supabase()
        .from("tbl_bo_input")
        .update({
          total_cost: totalCost,
        })
        .eq("id", ticket.id);

      if (ticketUpdateError) throw ticketUpdateError;

      // 2. Append updates to the operational lifecycle workflow table
      const workflowPayload = {
        rwh_acc_updated_at: timestampIso,
      };

      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update(workflowPayload)
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 3. Dispatch the outward Apps Script Notification background utility
      handleOutboundNotification();

      // 4. Hot-reload snapshot states
      setRefreshNonce((prev) => prev + 1);
      toast.success("Total return valuation metrics logged successfully!");
    } catch (error: any) {
      console.error(
        "Critical error mapping accounting workflow constraints:",
        error.message,
      );
      toast.error(`Accounting Processing Fault: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Guard Clause #1: Processing/Spinup
  if (isLoading || !ticket) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Compiling financial ledger matrices...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" /> Financial Cost
              Assessment
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Assign final macro asset losses, evaluate received warehouse
            metrics, and post valuation summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pl-9 sm:pl-0">
          <Button
            size="sm"
            className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            disabled={isSubmitting || isTerminated || isAlreadyCosted}
            onClick={handleFinancialSubmission}
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            {isAlreadyCosted
              ? "Financial Cost Posted"
              : "Verify and Submit Total Valuation"}
          </Button>
        </div>
      </div>

      {/* Main Structural Grid Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 border p-4 bg-slate-50/50 rounded-xl text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">
                Customer Outlet Name:
              </span>
              <span className="font-semibold text-primary">
                {ticket.outlet_name}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                BP Code:
              </span>
              <span className="font-medium inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs bg-muted border">
                {ticket.bp_code}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Status:
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${
                  ticket.status === "Open"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : ticket.status === "Closed"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                }`}
              >
                {ticket.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Filer Identity:
              </span>
              <span className="font-semibold text-primary">
                {ticket.tbl_employees
                  ? `${ticket.tbl_employees.last_name}, ${ticket.tbl_employees.first_name}`
                  : "System-Generated"}
              </span>
            </div>
          </div>

          {/* Dedicated Accounting Valuation Interface */}
          <div className="border border-emerald-200 bg-emerald-50/20 p-5 rounded-xl space-y-3 shadow-sm">
            <div>
              <h3 className="text-xs font-bold tracking-wide text-emerald-800 uppercase flex items-center gap-1.5">
                Financial Processing Node
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Enter the absolute total net cost calculated for this return
                request summary down below.
              </p>
            </div>
            <div className="flex items-center gap-3 max-w-sm">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">
                  ₱
                </span>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-7 font-mono font-bold text-sm h-10 bg-white border-emerald-300 focus-visible:ring-emerald-500"
                  value={totalCost}
                  disabled={isSubmitting || isTerminated || isAlreadyCosted}
                  onChange={(e) => handleCostChange(e.target.value)}
                  min={0}
                  step="0.01"
                />
              </div>
              <span className="text-xs font-semibold text-slate-500 font-sans">
                PHP Total Net Cost
              </span>
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Verification Attachments ({attachments.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={
                      supabase()
                        .storage.from("bad-orders-attachments")
                        .getPublicUrl(a.file_path).data.publicUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 text-xs truncate text-slate-600 font-mono transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate">
                      {a.file_path.split("/").pop()}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Locked Quantities & Field Notes Reference Audit Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Physical Manifest Volume Audit (Locked Reference)
              </h3>
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded">
                Quantities verified by logistics. Read-only view for billing
                calculations.
              </span>
            </div>
            <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">
                      SKU / Item Description
                    </TableHead>
                    <TableHead className="w-[100px]">Reason</TableHead>
                    <TableHead className="text-center w-[65px]">
                      Req Qty
                    </TableHead>
                    <TableHead className="text-center w-[75px] bg-slate-50/50">
                      Ret Qty
                    </TableHead>
                    <TableHead className="w-[65px]">UOM</TableHead>
                    <TableHead className="w-[100px]">RGS #</TableHead>
                    <TableHead className="w-[140px]">Logistics Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const hasDiscrepancy =
                      item.actual_qty !== null &&
                      item.actual_qty !== item.request_qty;

                    return (
                      <TableRow
                        key={item.id}
                        className="text-xs hover:bg-slate-50/50 align-middle"
                      >
                        {/* SKU Item Details */}
                        <TableCell>
                          <span className="font-mono font-medium block text-slate-900">
                            {item.item_code}
                          </span>
                          <span
                            className="text-muted-foreground block max-w-[150px] truncate"
                            title={item.item_description}
                          >
                            {item.item_description}
                          </span>
                        </TableCell>

                        {/* Return Reason Field */}
                        <TableCell className="text-slate-600 font-medium">
                          {item.reason || "N/A"}
                        </TableCell>

                        {/* Request Qty Field */}
                        <TableCell className="text-center font-medium text-slate-500">
                          {item.request_qty}
                        </TableCell>

                        {/* Actual Count Verified by Logistics */}
                        <TableCell className="bg-slate-50/30 text-center font-bold text-slate-800">
                          <div className="flex items-center justify-center gap-1">
                            <span>{item.actual_qty ?? "Unverified"}</span>
                            {hasDiscrepancy && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>

                        {/* Unit Type Metric Label */}
                        <TableCell className="font-medium text-muted-foreground">
                          {item.uom || "PCS"}
                        </TableCell>

                        {/* Read-only Logistics RGS Number field assignment */}
                        <TableCell className="font-mono font-medium text-slate-700">
                          {item.rgs_number ? (
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border text-[11px]">
                              {item.rgs_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </TableCell>

                        {/* Read-only Logistics Intake Notes */}
                        <TableCell
                          className="text-slate-600 max-w-[140px] truncate italic"
                          title={item.logistics_remarks}
                        >
                          {item.logistics_remarks || (
                            <span className="text-slate-300 not-italic">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {ticket.remarks && (
            <div className="bg-slate-50 p-4 rounded-xl border text-xs">
              <span className="font-semibold text-slate-700 block mb-1">
                Filer Remarks:
              </span>
              <p className="italic text-slate-600 leading-relaxed">
                {ticket.remarks}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Reference ID: {ticket.id}
          </p>
        </div>

        {/* Real-Time Timeline Sequence Sidebar */}
        <div className="w-full">
          <RequestTimeline
            key={`accounting-timeline-${ticket.id}-${ticket.status}-${refreshNonce}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </div>
  );
}
