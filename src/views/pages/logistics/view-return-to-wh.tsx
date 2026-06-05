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
import {
  emailNotifierUtil,
  type DisposalRequestPayload,
} from "@/lib/email-notifier";
import { toast } from "sonner";

interface QuantityState {
  [itemId: string]: number | "";
}

interface UomState {
  [itemId: string]: string;
}

interface RgsState {
  [itemId: string]: number | "";
}

interface RemarksState {
  [itemId: string]: string;
}

export default function LogisticsViewReturnWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);

  // --- Item-Level Logistics States ---
  const [quantities, setQuantities] = useState<QuantityState>({});
  const [uoms, setUoms] = useState<UomState>({});
  const [rgsNumbers, setRgsNumbers] = useState<RgsState>({});
  const [logisticsRemarks, setLogisticsRemarks] = useState<RemarksState>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingApproval, setIsLoadingApproval] = useState(false);
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
      setIsLoading(true);
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

      const itemsRes = await supabase()
        .from("tbl_bo_input_items")
        .select("*")
        .eq("bo_input_id", id);

      const attachRes = await supabase()
        .from("tbl_bo_attachments")
        .select("*")
        .eq("bo_input_id", id);

      const fetchedItems = itemsRes.data || [];
      setTicket(ticketRes.data || null);
      setItems(fetchedItems);
      setAttachments(attachRes.data || []);

      // Build dynamic row states directly from the sub-item records array
      const initialQuantities: QuantityState = {};
      const initialUoms: UomState = {};
      const initialRgs: RgsState = {};
      const initialRemarks: RemarksState = {};

      fetchedItems.forEach((item) => {
        initialQuantities[item.id] =
          item.actual_qty !== null ? item.actual_qty : item.request_qty;
        initialUoms[item.id] = item.uom || "PCS";
        initialRgs[item.id] = item.rgs_number !== null ? item.rgs_number : "";
        initialRemarks[item.id] = item.logistics_remarks || "";
      });

      setQuantities(initialQuantities);
      setUoms(initialUoms);
      setRgsNumbers(initialRgs);
      setLogisticsRemarks(initialRemarks);
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
  }, [id, refreshNonce]);

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

  // Handle specific row RGS number typing variants
  const handleRgsChange = (itemId: string, val: string) => {
    if (val === "") {
      setRgsNumbers((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      setRgsNumbers((prev) => ({ ...prev, [itemId]: parsed }));
    }
  };

  // Handle localized notes modifications
  const handleRemarksChange = (itemId: string, val: string) => {
    setLogisticsRemarks((prev) => ({ ...prev, [itemId]: val }));
  };

  // Handle selected standard scale configurations
  const handleUomChange = (itemId: string, val: string) => {
    setUoms((prev) => ({ ...prev, [itemId]: val }));
  };

  // Packages state data into structured utility contract payloads for Apps Script
  const handleOutboundNotification = (updatedItems: any[]) => {
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
      status: "Logistics Counted - Awaiting Accounting Verification",
      dateTime: new Date().toISOString(),
      remarks: ticket.remarks || "",
      filer: {
        first_name: ticket.tbl_employees?.first_name || "System",
        last_name: ticket.tbl_employees?.last_name || "Filer",
      },
      items: updatedItems.map((i) => ({
        item_code: i.item_code,
        item_description: i.item_description,
        uom: uoms[i.id] || i.uom || "PCS",
        request_qty: Number(i.request_qty),
        actual_qty: Number(quantities[i.id]),
        expiration_date: i.expiration_date,
        reason: i.reason,
        // Forward row details down the outbound communications node payload
        rgs_number: rgsNumbers[i.id] || "N/A",
        logistics_remarks: logisticsRemarks[i.id] || "None",
      })),
      attachments: parsedAttachments,
    };

    emailNotifierUtil.sendReturnToWHToAccounting(alertPayload);
  };

  // Pure Transactional Logistics Execution Engine
  async function handleWorkflowAction(actionType: "APPROVE" | "REJECTED") {
    try {
      setIsLoadingApproval(true);
      const timestampIso = new Date().toISOString();

      // Validate that all interactive parameters contain integers prior to locking configurations
      if (actionType === "APPROVE") {
        const hasMissingQty = items.some((item) => quantities[item.id] === "");
        const hasMissingRgs = items.some((item) => rgsNumbers[item.id] === "");

        if (hasMissingQty) {
          toast.error(
            "Validation Error: Please verify all lines have checked quantity dimensions filled.",
          );
          return;
        }
        if (hasMissingRgs) {
          toast.error(
            "Validation Error: Every checked row requires an active RGS slip assignment number.",
          );
          return;
        }
      }

      // 1. Update status timeline checkpoints within the global flow engine
      const workflowPayload = {
        rwh_logistic_updated_at: timestampIso,
        ...(actionType === "REJECTED" && {
          rwh_agm_status: "REJECTED",
          rwh_agm_updated_at: timestampIso,
        }),
      };

      const { error: workflowError } = await supabase()
        .from("tbl_bo_workflow")
        .update(workflowPayload)
        .eq("bo_input_id", ticket.id);

      if (workflowError) throw workflowError;

      // 2. Perform parallel row adjustments to the items tracking tables matrix
      if (actionType === "APPROVE") {
        const updatePromises = items.map((item) =>
          supabase()
            .from("tbl_bo_input_items")
            .update({
              actual_qty: quantities[item.id],
              uom: uoms[item.id],
              rgs_number:
                rgsNumbers[item.id] !== "" ? Number(rgsNumbers[item.id]) : null,
              logistics_remarks: logisticsRemarks[item.id].trim() || null,
            })
            .eq("id", item.id),
        );

        const results = await Promise.all(updatePromises);
        const processingError = results.find((res) => res.error);
        if (processingError) throw processingError.error;

        // Dispatch notifications downstream to Accounting nodes
        handleOutboundNotification(items);
      }

      setRefreshNonce((prev) => prev + 1);
      toast.success("Logistics items updated and verified successfully!");
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

  // Guard Clause #1: Wait until loading sequence clears AND ticket state finishes initialization
  if (isLoading || !ticket) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Parsing logistics tracking metrics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Action Controls Layout */}
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
            Logistics intake counting, physical row verification, and tracking
            timeline.
          </p>
        </div>

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

      {/* Main Structural Interface Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
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
                Requested By:
              </span>
              <span className="font-semibold text-primary">
                {ticket.tbl_employees
                  ? `${ticket.tbl_employees.last_name}, ${ticket.tbl_employees.first_name}`
                  : "System Filer"}
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

          {/* Table Container Segment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                Itemized Verification Manifest Table
              </h3>
              <span className="text-[11px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded">
                {isAlreadySubmitted || ticket.status === "Closed"
                  ? "Manifest submission finalized. Input values locked."
                  : "Edit line inputs below to modify warehouse floor arrival variables"}
              </span>
            </div>
            <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">
                      SKU / Item Description
                    </TableHead>
                    <TableHead className="w-[110px]">Reason</TableHead>
                    <TableHead className="text-center w-[70px]">
                      Req Qty
                    </TableHead>
                    <TableHead className="text-center w-[100px] bg-slate-50/50">
                      Ret Qty
                    </TableHead>
                    <TableHead className="w-[110px]">RGS #</TableHead>
                    <TableHead className="w-[160px]">Logistics Notes</TableHead>
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
                        <TableCell>
                          <span className="font-mono font-medium block text-slate-900">
                            {item.item_code}
                          </span>
                          <span
                            className="text-muted-foreground block max-w-[160px] truncate"
                            title={item.item_description}
                          >
                            {item.item_description}
                          </span>
                        </TableCell>
                        <TableCell className="p-1">{item.reason}</TableCell>
                        <TableCell className="text-center font-medium text-slate-700">
                          {item.request_qty}
                        </TableCell>

                        {/* 1. Returned Floor Qty Entry */}
                        <TableCell className="bg-slate-50/30 p-1">
                          <div className="flex items-center justify-center gap-1 max-w-[85px] mx-auto">
                            <Input
                              type="number"
                              className="h-8 text-xs text-center bg-white p-1"
                              disabled={
                                isLoadingApproval ||
                                isTerminated ||
                                isAlreadySubmitted
                              }
                              value={quantities[item.id] ?? ""}
                              onChange={(e) =>
                                handleQtyChange(item.id, e.target.value)
                              }
                              min={0}
                            />
                            {isDiscrepancy && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>

                        {/* 3. Local Row-specific RGS Input */}
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            placeholder="RGS #"
                            className="h-8 text-xs"
                            disabled={
                              isLoadingApproval ||
                              isTerminated ||
                              isAlreadySubmitted
                            }
                            value={rgsNumbers[item.id] ?? ""}
                            onChange={(e) =>
                              handleRgsChange(item.id, e.target.value)
                            }
                          />
                        </TableCell>

                        {/* 4. Local Row-specific Logistics Remarks Input */}
                        <TableCell className="p-1">
                          <Input
                            placeholder="Anomalies..."
                            className="h-8 text-xs"
                            disabled={
                              isLoadingApproval ||
                              isTerminated ||
                              isAlreadySubmitted
                            }
                            value={logisticsRemarks[item.id] ?? ""}
                            onChange={(e) =>
                              handleRemarksChange(item.id, e.target.value)
                            }
                          />
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

        {/* Audit Sequence Timeline Sidebar Module */}
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
