// pages/bad-orders/ViewReturnWarehouseDetailsPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
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
import { toast } from "sonner";

interface QuantityState {
  [itemId: string]: number | "";
}

export default function LogisticsViewReturnWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<QuantityState>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingApproval, setIsLoadingApproval] = useState(false);

  // 💡 Added a refresh nonce state to force a clean timeline remount cycle
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Helper flag to check if counts have already been submitted previously
  const isAlreadySubmitted =
    items.length > 0 && items.every((item) => item.actual_qty !== null);

  // Master tracking variable to determine if ticket is out of active lifecycle stages
  const isTerminated =
    ticket?.status === "Approved" ||
    ticket?.status === "Rejected" ||
    ticket?.status === "Closed";

  // Core Data Fetch Engine
  async function fetchDetailedData() {
    if (!id) return;
    try {
      const ticketRes = await supabase()
        .from("tbl_bo_input")
        .select(
          `*, tbl_employees (
                    first_name,
                    last_name
                  )
            first_name,
            last_name
          )`,
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

      const fetchedItems = itemsRes.data || [];
      setTicket(ticketRes.data);
      setItems(fetchedItems);
      setAttachments(attachRes.data || []);

      // Build initial dynamic quantities layout from current database snapshot
      const initialQuantities: QuantityState = {};
      fetchedItems.forEach((item) => {
        initialQuantities[item.id] =
          item.actual_qty !== null ? item.actual_qty : item.request_qty;
      });
      setQuantities(initialQuantities);
    } catch (err) {
      console.error(
        "Failed loading warehouse logistics manifest matrix data hooks",
        err,
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchDetailedData();
  }, [id]);

  // Handle live numeric changes on the warehouse floor layout
  const handleQtyChange = (itemId: string, val: string) => {
    if (val === "") {
      setQuantities((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setQuantities((prev) => ({ ...prev, [itemId]: parsed }));
    }
  };

  // Pure Transactional Logistics Execution Engine
  async function handleWorkflowAction(actionType: "APPROVE" | "REJECTED") {
    try {
      setIsLoadingApproval(true);
      const timestampIso = new Date().toISOString();

      // 1. Validate that all inputs have values filled out before processing an approval
      if (actionType === "APPROVE") {
        const hasMissingFields = items.some(
          (item) => quantities[item.id] === "",
        );
        if (hasMissingFields) {
          toast.error(
            "Logistics processing fault: Please ensure all verified volume inputs are valid integers before submission.",
          );
          return;
        }
      }

      // 2. Prepare dynamic payload tracking injections matching Logistics metrics schema rule sets
      const workflowPayload = {
        rwh_logistic_updated_at: timestampIso,
        ...(actionType === "REJECTED" && {
          rwh_agm_status: "REJECTED",
          rwh_agm_updated_at: timestampIso,
        }),
      };

      // Update workflow sequence records directly
      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update(workflowPayload)
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 3. Update actual inventory line counts on the database if approved
      if (actionType === "APPROVE") {
        const updatePromises = items.map((item) =>
          supabase()
            .from("tbl_bo_input_items")
            .update({ actual_qty: quantities[item.id] })
            .eq("id", item.id),
        );

        const results = await Promise.all(updatePromises);
        const processingError = results.find((res) => res.error);
        if (processingError) throw processingError.error;
      }

      // 5. Hot-reload data changes and bump layout key signature flags
      await fetchDetailedData();

      // 💡 Bumping this counter guarantees that the React element tree flashes its key and forces a re-fetch
      setRefreshNonce((prev) => prev + 1);

      toast.success("Logistics counts verified and submitted successfully!");
    } catch (error: any) {
      console.error(
        "Critical error processing logistics workflow optimization rules:",
        error.message,
      );
      toast.error(`Pipeline Mutation Fault: ${error.message}`);
    } finally {
      setIsLoadingApproval(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Parsing logistics tracking metrics...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Target RWH document metadata missing or deleted context error.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>
    );
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
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">
              Return to Warehouse Audit Trace
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Logistics intake counting, physical item verification, and tracking
            timeline.
          </p>
        </div>

        {/* Action Button Controls Module */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pl-9 sm:pl-0">
          <Button
            size="sm"
            className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isLoadingApproval || isTerminated || isAlreadySubmitted}
            onClick={() => handleWorkflowAction("APPROVE")}
          >
            {isLoadingApproval ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            {isAlreadySubmitted
              ? "Counts Verified"
              : "Submit and Verify Counts"}
          </Button>
        </div>
      </div>

      {/* Main Structural Panels Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-4 gap-4 border p-4 bg-slate-50/50 rounded-xl text-sm">
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
                Requested By:
              </span>
              <span className="font-semibold text-primary">
                {ticket.tbl_employees.last_name},{" "}
                {ticket.tbl_employees.first_name}
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
                    <span className="truncate">{a.file_path}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Logistics Interactive Verification Manifest */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Itemized Verification Manifest Table
              </h3>
              <span className="text-[11px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded">
                {isAlreadySubmitted || ticket.status === "Closed"
                  ? "Manifest submission finalized. Input values locked."
                  : "Edit right-hand column values below to update dock arrival volumes"}
              </span>
            </div>
            <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center w-[140px]">
                      Requested Qty
                    </TableHead>
                    <TableHead className="text-center w-[160px] bg-slate-50/50">
                      Returned Qty
                    </TableHead>
                    <TableHead>Unit Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isDiscrepancy =
                      quantities[item.id] !== item.request_qty;

                    return (
                      <TableRow
                        key={item.id}
                        className="text-xs hover:bg-slate-50/50 align-middle"
                      >
                        <TableCell className="font-mono font-medium">
                          {item.item_code}
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate"
                          title={item.item_description}
                        >
                          {item.item_description}
                        </TableCell>
                        <TableCell className="text-center font-medium text-slate-700">
                          {item.request_qty}
                        </TableCell>
                        <TableCell className="bg-slate-50/30 p-2">
                          <div className="flex items-center justify-center gap-1.5 max-w-[150px] mx-auto">
                            <Input
                              type="number"
                              className="h-8 text-xs font-semibold text-center w-[100px] bg-white"
                              disabled={
                                isLoadingApproval ||
                                isTerminated ||
                                isAlreadySubmitted
                              }
                              value={quantities[item.id] ?? ""}
                              onChange={(e) =>
                                handleQtyChange(item.id, e.target.value)
                              }
                              placeholder="Enter quantity"
                              min={0}
                            />
                            {isDiscrepancy && (
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-muted-foreground">
                          {item.uom}
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
                Remarks:
              </span>
              <p className="italic text-slate-600 leading-relaxed">
                {ticket.remarks}
              </p>
            </div>
          )}

          <p className="text-xs">Reference ID: {ticket.id}</p>
        </div>

        {/* Real-Time Processing Sequence Timeline Sidebar */}
        <div className="w-full">
          <RequestTimeline
            key={`timeline-${ticket.id}-${ticket.status}-${refreshNonce}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </div>
  );
}
