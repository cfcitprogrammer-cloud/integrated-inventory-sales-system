// pages/bad-orders/DirectDisposalApprovalDetailsPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  Package,
  Calendar,
  AlertCircle,
  Download,
} from "lucide-react";
import { supabase } from "@/config/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import RequestTimeline from "@/components/custom/timeline";
import {
  emailNotifierUtil,
  type DisposalRequestPayload,
} from "@/lib/email-notifier";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function AccountingViewDirectDisposalsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [workflowState, setWorkflowState] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // 🔒 Disables actions if master ticket status is terminal OR if accounting has already voted
  const isTerminated =
    ticket?.status === "Approved" ||
    ticket?.status === "Rejected" ||
    ticket?.status === "Closed" ||
    workflowState?.dd_acc_status === "APPROVED" ||
    workflowState?.dd_acc_status === "REJECTED";

  // Core Direct Disposal Fetch Engine matching schema relations
  async function fetchDetailedData() {
    if (!id) return;
    try {
      const ticketRes = await supabase()
        .from("tbl_bo_input")
        .select(
          `*, tbl_employees (
            first_name,
            last_name,
            email
          )`,
        )
        .eq("id", id)
        .single();

      // Fetch items manifest directly from tbl_bo_input_items
      const itemsRes = await supabase()
        .from("tbl_bo_input_items")
        .select("*")
        .eq("bo_input_id", id);

      // Fetch accompanying attachments from tbl_bo_attachments
      const attachRes = await supabase()
        .from("tbl_bo_attachments")
        .select("*")
        .eq("bo_input_id", id);

      // Fetch direct workflow matrix tracking columns from tbl_bo_workflow
      const workflowRes = await supabase()
        .from("tbl_bo_workflow")
        .select("dd_acc_status, dd_agm_status")
        .eq("bo_input_id", id)
        .maybeSingle();

      setTicket(ticketRes.data);
      setItems(itemsRes.data || []);
      setAttachments(attachRes.data || []);
      setWorkflowState(workflowRes.data);
    } catch (err) {
      console.error(
        "Failed loading direct disposal approval manifest hooks:",
        err,
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchDetailedData();
  }, [id, refreshNonce]);

  // Packages state data into structured utility contract payloads
  const handleOutboundNotification = (decision: "Approved" | "Rejected") => {
    if (decision !== "Approved") return;

    // Map public bucket links for file access transparency
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
      status: "Accounting Approved - Pending GM Review",
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
        expiration_date: i.expiration_date,
        reason: i.reason,
      })),
      attachments: parsedAttachments,
    };

    // Run structural alert pipeline hand-off to notify your App Script target URL
    emailNotifierUtil.sendDirectDisposalToAGM(alertPayload);
  };

  // Pure Binary Decision Workflow Processing Engine
  async function handleWorkflowAction(decision: "Approved" | "Rejected") {
    try {
      setIsSubmitting(true);
      const timestampIso = new Date().toISOString();
      const decisionUpper = decision.toUpperCase();

      // 1. Update tbl_bo_workflow columns explicitly mapped to schema
      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update({
          dd_acc_status: decisionUpper,
          dd_acc_updated_at: timestampIso,
        })
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 2. Determine Master Ticket Status using the schema's workflow structure
      let targetMasterStatus = ticket.status;

      if (decisionUpper === "REJECTED") {
        targetMasterStatus = "Rejected";
      } else if (decisionUpper === "APPROVED") {
        if (workflowState?.dd_agm_status === "APPROVED") {
          targetMasterStatus = "Approved";
        } else {
          targetMasterStatus = "Open"; // Stays Open awaiting total verification tree clearance
        }
      }

      const { error: masterError } = await supabase()
        .from("tbl_bo_input")
        .update({
          status: targetMasterStatus,
        })
        .eq("id", ticket.id);

      if (masterError) throw masterError;

      // 3. Dispatch the Apps Script Webhook via our integrated utility file
      handleOutboundNotification(decision);

      // Hot-reload context flags immediately
      setRefreshNonce((prev) => prev + 1);
      toast.success(
        `Direct disposal request successfully marked as ${decision} by Accounting!`,
      );
    } catch (error: any) {
      console.error(
        "Critical error mapping disposal validation matrix updates:",
        error.message,
      );
      toast.error(`Workflow Update Fault: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Export Items Manifest to Excel
  const handleExportExcel = () => {
    if (!ticket || items.length === 0) {
      toast.error("No items available to export.");
      return;
    }

    try {
      // Prepare metadata for the export
      const headerData = [
        ["Direct Disposal Summary"],
        ["Request ID", ticket.id],
        ["Customer Outlet Name", ticket.outlet_name],
        ["BP Code", ticket.bp_code],
        ["Status", ticket.status],
        [
          "Filer",
          ticket.tbl_employees
            ? `${ticket.tbl_employees.last_name}, ${ticket.tbl_employees.first_name}`
            : "System-Generated",
        ],
        [],
        ["Item Manifest"],
      ];

      // Prepare items data
      const itemsData = items.map((item) => ({
        "SKU Item Code": item.item_code,
        Description: item.item_description,
        "Expiration Date": item.expiration_date || "No date",
        Reason: item.reason || "Unspecified",
        "Request Qty": item.request_qty,
        UOM: item.uom || "PCS",
      }));

      // Create a worksheet
      const ws = XLSX.utils.aoa_to_sheet(headerData);

      // Append items data starting at row 9 (after the header)
      XLSX.utils.sheet_add_json(ws, itemsData, { origin: "A9" });

      // Build workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Disposal Manifest");

      // Save file
      const fileName = `DirectDisposal_${ticket.bp_code || ticket.id}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success("Excel manifest downloaded successfully.");
    } catch (error) {
      console.error("Export to Excel failed:", error);
      toast.error("Failed to export Excel manifest.");
    }
  };

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">
          Parsing disposal authorization parameters...
        </span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Target direct disposal tracking metadata missing context error.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Container displaying active binary controls */}
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
            <h1 className="text-xl font-bold tracking-tight">
              Direct Disposal Evaluation Node
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Review submitted asset documentation records to authorize or reject
            field disposal directly.
          </p>
        </div>

        {/* Binary Action Operations Block */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pl-9 sm:pl-0">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none text-xs font-medium"
            onClick={handleExportExcel}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Export Manifest
          </Button>

          <Button
            size="sm"
            variant="destructive"
            className="flex-1 sm:flex-none text-xs font-medium"
            disabled={isSubmitting || isTerminated}
            onClick={() => handleWorkflowAction("Rejected")}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject Request
          </Button>

          <Button
            size="sm"
            className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            disabled={isSubmitting || isTerminated}
            onClick={() => handleWorkflowAction("Approved")}
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Approve Request
          </Button>
        </div>
      </div>

      {/* Structured Content Views */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Grid Info Summary */}
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
                Current Status:
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${
                  ticket.status === "Approved"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : ticket.status === "Rejected" || ticket.status === "Closed"
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

          {/* 📦 SKU / Disposal Items Manifest */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase flex items-center gap-1">
              <Package className="h-3.5 w-3.5 text-slate-500" /> Disposal Item
              Manifest
            </h3>
            <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Expiration Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-center w-[120px]">
                      Disposal Qty
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-6 text-muted-foreground text-xs"
                      >
                        No items found listed in this disposal request.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="text-xs hover:bg-slate-50/50 align-middle"
                      >
                        <TableCell className="font-mono font-medium text-slate-600">
                          {item.item_code}
                        </TableCell>
                        <TableCell
                          className="max-w-[180px] truncate font-medium text-slate-900"
                          title={item.item_description}
                        >
                          {item.item_description}
                        </TableCell>
                        <TableCell className="text-slate-600 font-mono">
                          {item.expiration_date ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {item.expiration_date}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              No date
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-slate-600 max-w-[150px] truncate capitalize">
                          {item.reason ? (
                            <span
                              className="flex items-center gap-1"
                              title={item.reason}
                            >
                              <AlertCircle className="h-3 w-3 text-slate-400 shrink-0" />
                              {item.reason}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              Unspecified
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-800 whitespace-nowrap">
                          {item.request_qty}{" "}
                          <span className="text-[10px] font-normal font-mono text-slate-500 uppercase ml-0.5">
                            {item.uom || "PCS"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Secure Evidence Attachments Manifest */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Field Evidence Attachments ({attachments.length})
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
                      {a.file_path.split("/").pop() || "Evidence_File"}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Remarks Section */}
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

        {/* Real-Time Processing Sequence Timeline Sidebar */}
        <div className="w-full">
          <RequestTimeline
            key={`direct-disposal-timeline-${ticket.id}-${ticket.status}-${refreshNonce}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </div>
  );
}
