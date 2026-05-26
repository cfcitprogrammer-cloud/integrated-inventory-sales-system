// pages/bad-orders/ViewBadOrderDetailsPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
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
import RequestTimeline from "@/components/custom/timeline";

export default function AccountingViewDirectDisposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingApproval, setIsLoadingApproval] = useState(false);

  // Helper to centralize loading fresh data on initial mount & post-mutation
  async function fetchDetailedData() {
    if (!id) return;
    try {
      const ticketRes = await supabase()
        .from("tbl_bo_input")
        .select("*")
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

      setTicket(ticketRes.data);
      setItems(itemsRes.data || []);
      setAttachments(attachRes.data || []);
    } catch (err) {
      console.error("Failed loading manifest values matrix data hooks", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchDetailedData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Parsing tracking metrics...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Target document metadata missing or deleted context error.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/bad-orders")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>
    );
  }

  // Pure Transactional Execution Engine
  async function handleWorkflowAction(actionType: "APPROVE" | "REJECTED") {
    try {
      setIsLoadingApproval(true);
      const isDisposal = ticket.workflow_type === "For Disposal";
      const timestampIso = new Date().toISOString();

      // 1. Prepare dynamic payload injections matching your explicit tracking schema rule sets
      const workflowPayload = isDisposal
        ? {
            dd_acc_status: actionType,
            dd_acc_updated_at: timestampIso,
          }
        : {
            rwh_acc_updated_at: timestampIso,
            // If rejected at accounting level on a Return, we can conclude or flag the AGM status
            ...(actionType === "REJECTED" && {
              rwh_agm_status: "REJECTED",
              rwh_agm_updated_at: timestampIso,
            }),
          };

      // 2. Perform the update mutation directly on the tracking table matching the current transaction ID
      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update(workflowPayload)
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 3. Sync state back to core record tracking so master queues stay uniform
      // If a document gets explicitly rejected here, the entire request lifecycle ends
      let syncedMasterStatus = ticket.status;
      if (actionType === "REJECTED") {
        syncedMasterStatus = "Rejected";
      } else if (actionType === "APPROVE" && isDisposal) {
        // Keeps it as Pending because it still needs to travel down the pipeline to the AGM desk
        syncedMasterStatus = "Pending";
      }

      const { error: masterTicketError } = await supabase()
        .from("tbl_bo_input")
        .update({ status: syncedMasterStatus })
        .eq("id", ticket.id);

      if (masterTicketError) throw masterTicketError;

      // 4. Hot-reload components gracefully instead of triggering a full window document refresh
      await fetchDetailedData();
    } catch (error: any) {
      console.error(
        "Critical error processing workflow step optimization rules:",
        error.message,
      );
      alert(`Pipeline Mutation Fault: ${error.message}`);
    } finally {
      setIsLoadingApproval(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => navigate("/bad-orders")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">
              Return/BO Document Trace: {ticket.bp_code}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Filing verification metadata timeline.
          </p>
        </div>

        {/* Action Button Controls Module */}
        <div className="flex items-center gap-2 w-full sm:w-auto pl-9 sm:pl-0">
          <Button
            variant="destructive"
            size="sm"
            className="flex-1 sm:flex-none text-xs"
            disabled={
              isLoadingApproval ||
              ticket.status === "Rejected" ||
              ticket.status === "Approved"
            }
            onClick={() => handleWorkflowAction("REJECTED")}
          >
            {isLoadingApproval ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <XCircle className="h-3.5 w-3.5 mr-1" />
            )}
            Reject
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={
              isLoadingApproval ||
              ticket.status === "Rejected" ||
              ticket.status === "Approved"
            }
            onClick={() => handleWorkflowAction("APPROVE")}
          >
            {isLoadingApproval ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Approve
          </Button>
        </div>
      </div>

      {/* Grid panels layout: Splitting transaction metadata from the real-time tracking timeline component */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 gap-4 border p-4 bg-slate-50/50 rounded-xl text-sm">
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
                Route Assignment:
              </span>
              <span className="font-medium inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs bg-muted border">
                {ticket.workflow_type}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Status:
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${
                  ticket.status === "Approved"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : ticket.status === "Rejected"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                }`}
              >
                {ticket.status}
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
                        .getPublicUrl(a.filepath).data.publicUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 text-xs truncate text-slate-600 font-mono transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate">Reference File</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
              Itemized Manifest Table
            </h3>
            <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">
                      Requested Volume
                    </TableHead>
                    <TableHead className="text-center">
                      Actual Verified Volume
                    </TableHead>
                    <TableHead>Unit Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="text-xs hover:bg-slate-50/50"
                    >
                      <TableCell className="font-mono font-medium">
                        {item.item_code}
                      </TableCell>
                      <TableCell
                        className="max-w-[240px] truncate"
                        title={item.item_description}
                      >
                        {item.item_description}
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-700">
                        {item.request_qty}
                      </TableCell>
                      <TableCell className="text-center italic text-muted-foreground">
                        {item.actual_qty ?? "Awaiting Count"}
                      </TableCell>
                      <TableCell>{item.uom}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {ticket.remarks && (
            <div className="bg-slate-50 p-4 rounded-xl border text-xs">
              <span className="font-semibold text-slate-700 block mb-1">
                Remarks & Audit Logs:
              </span>
              <p className="italic text-slate-600 leading-relaxed">
                {ticket.remarks}
              </p>
            </div>
          )}
        </div>

        {/* Interactive Self-Fetching Workflow Timeline Sidebar Column */}
        <div className="w-full">
          {/* Keying the component directly to an active ticket status string guarantees the internal timeline hooks re-fetch whenever the parent document state gets updated inside PostgreSQL */}
          <RequestTimeline
            key={`${ticket.id}-${ticket.status}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </div>
  );
}
