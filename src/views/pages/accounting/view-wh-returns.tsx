// pages/bad-orders/AccountingViewWarehouseReturnPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
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

export default function AccountingViewWarehouseReturnPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [totalCost, setTotalCost] = useState<string>("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingApproval, setIsLoadingApproval] = useState(false);

  // Core Data Fetch Engine
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

      // If a total cost was previously saved or cached, populate it
      if (ticketRes.data?.total_cost !== null) {
        setTotalCost(ticketRes.data.total_cost.toString());
      }
    } catch (err) {
      console.error(
        "Failed loading accounting variance evaluation matrices:",
        err,
      );
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
        <span className="text-xs">Balancing credit and audit schemas...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Target validation matrix missing or dead document pointer context.
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

  // Pure Transactional Accounting Execution Engine
  async function handleWorkflowAction(actionType: "APPROVE" | "REJECTED") {
    try {
      setIsLoadingApproval(true);
      const timestampIso = new Date().toISOString();

      // 1. Enforce financial bounds validation on validation processing steps
      if (actionType === "APPROVE") {
        const parsedCost = parseFloat(totalCost);
        if (isNaN(parsedCost) || parsedCost < 0) {
          alert(
            "Accounting Validation Fault: A clear, non-negative total validation aggregate cost must be assigned prior to credit tracking execution.",
          );
          return;
        }
      }

      // 2. Prepare dynamic payload injections matching corporate accounting validation tracking schemas
      const workflowPayload = {
        rwh_acc_updated_at: timestampIso,
        // Cascade down rejection tracking trees to automatically clean up subsequent gates
        ...(actionType === "REJECTED" && {
          rwh_agm_status: "REJECTED",
          rwh_agm_updated_at: timestampIso,
        }),
      };

      // Mutate historical workflow sequence tracks
      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update(workflowPayload)
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 3. Inject total aggregate calculation sums back onto core ticket layers alongside lifecycle synchronizations
      let syncedMasterStatus = ticket.status;
      if (actionType === "REJECTED") {
        syncedMasterStatus = "Rejected";
      } else if (actionType === "APPROVE") {
        // Keeps state pending as it travels onwards down the line items queue to General Management (AGM)
        syncedMasterStatus = "Pending";
      }

      const updatePayload: any = { status: syncedMasterStatus };
      if (actionType === "APPROVE") {
        updatePayload.total_cost = parseFloat(totalCost);
      }

      const { error: masterTicketError } = await supabase()
        .from("tbl_bo_input")
        .update(updatePayload)
        .eq("id", ticket.id);

      if (masterTicketError) throw masterTicketError;

      // Refresh data layers to re-evaluate tracking views smoothly
      await fetchDetailedData();
    } catch (error: any) {
      console.error(
        "Critical error processing accounting workflow audit mutations:",
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
              Accounting Valuation Review: {ticket.bp_code}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Financial auditing, total cost allocation execution, and milestone
            verification timelines.
          </p>
        </div>

        {/* Action Button Controls Module */}
        <div className="flex items-center gap-2 w-full sm:w-auto pl-9 sm:pl-0">
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
            Approve & Forward Financials
          </Button>
        </div>
      </div>

      {/* Main Structuring Layout Grids */}
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
                        .getPublicUrl(a.file_path).data.publicUrl
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

          {/* Locked-Down Logistics Reference Manifest Table */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Audited Itemized Verification Manifest
              </h3>
              <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU Item Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">
                        Requested Qty
                      </TableHead>
                      <TableHead className="text-center bg-emerald-50/30 text-emerald-900 font-semibold">
                        Logistics Counted Qty
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
                        <TableCell className="text-center text-muted-foreground font-medium">
                          {item.request_qty}
                        </TableCell>
                        <TableCell className="text-center font-bold bg-emerald-50/10 text-emerald-700">
                          {item.actual_qty ?? (
                            <span className="text-red-500 font-normal italic text-[11px]">
                              Skipped Floor Count
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{item.uom}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Centralized Aggregated Value Input Section */}
            <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Banknote className="h-4 w-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Total Valuation Cost Matrix
                  </h4>
                </div>
                <p className="text-xs text-slate-400 max-w-md">
                  Evaluate floor counts above and summarize the bulk adjusted
                  financial loss valuation below.
                </p>
              </div>

              <div className="w-full md:w-auto flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-300">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  className="h-10 text-sm font-mono font-bold bg-slate-950 border-slate-700 text-emerald-400 focus-visible:ring-emerald-500 text-right w-full md:w-[200px]"
                  placeholder="0.00"
                  disabled={
                    isLoadingApproval ||
                    ticket.status === "Rejected" ||
                    ticket.status === "Approved"
                  }
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  min={0}
                />
              </div>
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

        {/* Real-Time Processing Sequence Timeline Sidebar */}
        <div className="w-full">
          <RequestTimeline
            key={`${ticket.id}-${ticket.status}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </div>
  );
}
