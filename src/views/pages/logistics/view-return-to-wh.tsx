// pages/bad-orders/ViewReturnWarehouseDetailsPage.tsx
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
} from "lucide-react";
import { supabase, supabaseClients } from "@/config/db";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const REASON_OPTIONS = [
  "rat bite (nakagat ng daga)",
  "deflated (lumambot)",
  "expired (expired na)",
  "packaging issue (may problema sa packaging)",
  "damaged item (sirang produkto)",
  "nearly expired (in 3 months)",
  "wet (basa)",
  "punctured (nabutas)",
  "wrinkled (kulubot)",
  "folded (natupi)",
  "makunat",
  "durog",
  "polybag damage (sira ang polybag)",
  "others, please specify",
];

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

  // --- Add New Item Dialog States ---
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const skuRef = useRef<HTMLDivElement>(null);
  const [skuSearch, setSkuSearch] = useState("");
  const [debouncedSkuSearch, setDebouncedSkuSearch] = useState("");
  const [variants, setVariants] = useState<any[]>([]);
  const [showSkuDropdown, setShowSkuDropdown] = useState(false);
  const [isSearchingSkus, setIsSearchingSkus] = useState(false);
  const [customReason, setCustomReason] = useState("");

  const [currentItem, setCurrentItem] = useState({
    item_code: "",
    item_description: "",
    uom: "PCS",
    actual_qty: 1, // Represents the count found on the floor
    expiration_date: "",
    reason: "",
  });

  // Helper flag to check if counts have already been submitted previously
  // We ignore items that start with "temp_" from this check to allow form usage
  const isAlreadySubmitted =
    items.length > 0 &&
    items
      .filter((item) => !String(item.id).startsWith("temp_"))
      .every((item) => item.actual_qty !== null);

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

  // --- SKU Autocomplete Debounce & Query Logic ---
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSkuSearch(skuSearch), 300);
    return () => clearTimeout(t);
  }, [skuSearch]);

  useEffect(() => {
    async function querySkus() {
      const q = debouncedSkuSearch.trim();
      if (q.length < 2 || currentItem.item_code) return;
      setIsSearchingSkus(true);
      try {
        // Query the variant table and join the parent product table
        const { data, error } = await supabaseClients["sales.server.extension"]
          .from("product_variant")
          .select(
            `
            sku,
            name,
            alias,
            uom,
            products!inner (
              name
            )
          `,
          )
          // Searching by SKU, variant name, or alias
          .or(`sku.ilike.%${q}%,name.ilike.%${q}%,alias.ilike.%${q}%`)
          .limit(30);

        if (error) throw error;

        // Map the relational data back into the flat shape the component expects
        const formattedVariants = (data || []).map((v: any) => {
          // Safely extract the parent product name (handles arrays or single objects based on your relation setup)
          const parentName = Array.isArray(v.products)
            ? v.products[0]?.name
            : v.products?.name;

          const variantName = v.name || v.alias || "";

          return {
            item_code: v.sku,
            // Combine parent product name + variant name (e.g., "Coca-Cola 500ml")
            item_description:
              `${parentName || "Unknown"} - ${variantName}`.trim(),
            uom: v.uom || "PCS",
          };
        });

        setVariants(formattedVariants);
      } catch (err) {
        console.error("SKU database lookup error:", err);
      } finally {
        setIsSearchingSkus(false);
      }
    }
    querySkus();
  }, [debouncedSkuSearch, currentItem.item_code]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (skuRef.current && !skuRef.current.contains(event.target as Node)) {
        setShowSkuDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Handle Appending New Row Locally ---
  const handleAddNewItemLocal = () => {
    if (!currentItem.item_code) {
      return toast.error("Please select a valid variant from the dropdown.");
    }
    if (currentItem.actual_qty <= 0) {
      return toast.error("Quantity must be greater than zero.");
    }
    if (!currentItem.reason) {
      return toast.error("Please specify a reason.");
    }
    if (!currentItem.expiration_date) {
      return toast.error("Please specify an expiration date.");
    }

    const finalizedReason =
      currentItem.reason === "others, please specify"
        ? customReason.trim() || "Other Reason"
        : currentItem.reason;

    // Create a temporary unique ID for local state tracking
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newItem = {
      id: tempId, // Temporary ID, ignored by supabase() inserts
      bo_input_id: ticket.id,
      item_code: currentItem.item_code,
      item_description: currentItem.item_description,
      uom: currentItem.uom,
      request_qty: 0, // Hardcoded to 0 for extra floor items
      actual_qty: currentItem.actual_qty,
      expiration_date: currentItem.expiration_date,
      reason: finalizedReason,
      rgs_number: null,
      logistics_remarks: null,
    };

    // Inject into the main data array
    setItems((prev) => [...prev, newItem]);

    // Initialize the forms interactive state bindings for this new row
    setQuantities((prev) => ({ ...prev, [tempId]: currentItem.actual_qty }));
    setUoms((prev) => ({ ...prev, [tempId]: currentItem.uom }));
    setRgsNumbers((prev) => ({ ...prev, [tempId]: "" }));
    setLogisticsRemarks((prev) => ({ ...prev, [tempId]: "Extra item found" }));

    toast.success("Item added to local manifest. Submit to finalize.");
    setIsAddDialogOpen(false);

    // Clear form states for next usage
    setCurrentItem({
      item_code: "",
      item_description: "",
      uom: "PCS",
      actual_qty: 1,
      expiration_date: "",
      reason: "",
    });
    setSkuSearch("");
    setCustomReason("");
  };

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
      dateTime: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
      remarks: ticket.remarks || "No remarks filed.",
      filer: {
        first_name: ticket.tbl_employees?.first_name || "System",
        last_name: ticket.tbl_employees?.last_name || "Filer",
      },
      items: updatedItems.map((i) => {
        const rawActual = quantities[i.id];
        const rawRgs = rgsNumbers[i.id];
        const cleanRgs =
          rawRgs !== undefined && rawRgs !== null ? String(rawRgs).trim() : "";

        return {
          item_code: i.item_code,
          item_description: i.item_description,
          uom: uoms[i.id] || i.uom || "PCS",
          request_qty: Number(i.request_qty) || 0,
          actual_qty:
            rawActual !== undefined && rawActual !== null && rawActual !== ""
              ? Number(rawActual)
              : 0,
          rgs_number: cleanRgs !== "" ? cleanRgs : "N/A",
          logistics_remarks: logisticsRemarks[i.id]
            ? String(logisticsRemarks[i.id]).trim()
            : "None",
          expiration_date: i.expiration_date || null,
          reason: i.reason || "Unspecified",
        };
      }),
      attachments: parsedAttachments || [],
    };

    emailNotifierUtil.sendReturnToWHToAccounting(alertPayload);
  };

  // Pure Transactional Logistics Execution Engine
  async function handleWorkflowAction(actionType: "APPROVE" | "REJECTED") {
    try {
      setIsLoadingApproval(true);
      const timestampIso = new Date().toISOString();

      if (actionType === "APPROVE") {
        const hasMissingQty = items.some((item) => quantities[item.id] === "");
        // const hasMissingRgs = items.some((item) => rgsNumbers[item.id] === "");

        if (hasMissingQty) {
          toast.error(
            "Validation Error: Please verify all lines have checked quantity dimensions filled.",
          );
          return;
        }
        // if (hasMissingRgs) {
        //   toast.error(
        //     "Validation Error: Every checked row requires an active RGS slip assignment number.",
        //   );
        //   return;
        // }
      }

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

      if (actionType === "APPROVE") {
        // Segregate items that are already in DB vs locally appended items
        const existingItems = items.filter(
          (i) => !String(i.id).startsWith("temp_"),
        );
        const newlyAddedItems = items.filter((i) =>
          String(i.id).startsWith("temp_"),
        );

        // Explicitly set updatePromises to any[] to satisfy TS PostgrestBuilder conflicts
        const updatePromises: any[] = existingItems.map((item) =>
          supabase()
            .from("tbl_bo_input_items")
            .update({
              actual_qty: quantities[item.id],
              uom: uoms[item.id],
              rgs_number:
                rgsNumbers[item.id] !== "" ? Number(rgsNumbers[item.id]) : null,
              logistics_remarks: logisticsRemarks[item.id]?.trim() || null,
            })
            .eq("id", item.id),
        );

        // Perform a bulk insert for newly appended floor items
        if (newlyAddedItems.length > 0) {
          const insertPayloads = newlyAddedItems.map((item) => ({
            bo_input_id: ticket.id,
            item_code: item.item_code,
            item_description: item.item_description,
            uom: uoms[item.id] || item.uom,
            request_qty: 0, // Enforce strictly 0 into DB
            actual_qty: quantities[item.id],
            rgs_number:
              rgsNumbers[item.id] !== "" ? Number(rgsNumbers[item.id]) : null,
            logistics_remarks: logisticsRemarks[item.id]?.trim() || null,
            expiration_date: item.expiration_date,
            reason: item.reason,
          }));

          updatePromises.push(
            supabase().from("tbl_bo_input_items").insert(insertPayloads),
          );
        }

        // Wait for all DB writes to clear
        const results = await Promise.all(updatePromises);
        const processingError = results.find((res: any) => res.error);
        if (processingError) throw processingError.error;

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
              <div>
                <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                  Itemized Verification Manifest Table
                </h3>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  {isAlreadySubmitted || ticket.status === "Closed"
                    ? "Manifest submission finalized. Input values locked."
                    : "Edit line inputs below to modify warehouse floor arrival variables"}
                </span>
              </div>

              {/* Add Missing BO Row Trigger */}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    disabled={isAlreadySubmitted || isTerminated}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Extra Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl min-h-[50vh] max-h-[90vh] flex flex-col overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg tracking-tight">
                      Add Missing Bad Order Item
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 pt-4">
                    {/* SKU Autocomplete Search */}
                    <div ref={skuRef} className="space-y-1 relative">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Search Catalog SKU
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search product name, code, or alias..."
                          value={skuSearch}
                          className="pl-9 bg-background text-sm h-10"
                          onChange={(e) => {
                            setSkuSearch(e.target.value);
                            setShowSkuDropdown(true);
                            if (!e.target.value || currentItem.item_code) {
                              setCurrentItem((p) => ({
                                ...p,
                                item_code: "",
                                item_description: "",
                              }));
                              setVariants([]);
                            }
                          }}
                          onFocus={() => setShowSkuDropdown(true)}
                        />
                        {isSearchingSkus && (
                          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>

                      {showSkuDropdown && skuSearch.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md p-1">
                          {variants.length === 0 && !isSearchingSkus ? (
                            <div className="p-3 text-xs text-center text-muted-foreground">
                              No items found
                            </div>
                          ) : (
                            variants.map((v) => (
                              <div
                                key={v.item_code}
                                className="p-2 text-xs hover:bg-accent rounded-sm cursor-pointer flex justify-between items-start gap-4"
                                onClick={() => {
                                  setCurrentItem((prev) => ({
                                    ...prev,
                                    item_code: v.item_code,
                                    item_description: v.item_description,
                                    uom: v.uom || "PCS",
                                  }));
                                  setSkuSearch(v.item_description);
                                  setShowSkuDropdown(false);
                                }}
                              >
                                <div className="space-y-0.5">
                                  <div className="font-medium text-foreground">
                                    {v.item_description}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    SKU: {v.item_code}
                                  </div>
                                </div>
                                {v.uom && (
                                  <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-slate-500 font-mono shrink-0">
                                    {v.uom}
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selected Item Configuration Layout */}
                    {currentItem.item_code && (
                      <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-dashed transition-all animate-in fade-in duration-200">
                        <div>
                          <span className="text-xs text-muted-foreground block font-mono">
                            {currentItem.item_code}
                          </span>
                          <span className="font-semibold text-sm text-slate-800 block mt-1">
                            {currentItem.item_description}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-500 block">
                              Found/Received Qty ({currentItem.uom})
                            </label>
                            <Input
                              type="number"
                              min="1"
                              value={currentItem.actual_qty}
                              onChange={(e) =>
                                setCurrentItem((p) => ({
                                  ...p,
                                  actual_qty: Math.max(
                                    1,
                                    parseInt(e.target.value, 10) || 1,
                                  ),
                                }))
                              }
                              className="font-bold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-500 block">
                              Expiration Date
                            </label>
                            <Input
                              type="date"
                              value={currentItem.expiration_date || ""}
                              onChange={(e) =>
                                setCurrentItem((p) => ({
                                  ...p,
                                  expiration_date: e.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-[11px] font-medium text-slate-500 block">
                              Reason for Bad Order
                            </label>
                            <select
                              value={currentItem.reason || ""}
                              onChange={(e) =>
                                setCurrentItem((p) => ({
                                  ...p,
                                  reason: e.target.value,
                                }))
                              }
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="" disabled>
                                Select a reason...
                              </option>
                              {REASON_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>

                          {currentItem.reason === "others, please specify" && (
                            <div className="space-y-1 sm:col-span-2 pt-1 border-t transition-all animate-in slide-in-from-top-1 duration-150">
                              <label className="text-[11px] font-medium text-amber-700 block">
                                Please Specify Custom Reason
                              </label>
                              <Input
                                placeholder="Describe issue (e.g. Water logged)"
                                value={customReason}
                                onChange={(e) =>
                                  setCustomReason(e.target.value)
                                }
                                className="border-amber-300 focus-visible:ring-amber-500"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                          <Button
                            variant="outline"
                            onClick={() => setIsAddDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddNewItemLocal}
                            disabled={!currentItem.item_code}
                          >
                            Append to Manifest
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
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
                    const isLogisticsAdded =
                      String(item.id).startsWith("temp_") ||
                      item.request_qty === 0;

                    return (
                      <TableRow
                        key={item.id}
                        className={`text-xs align-middle transition-colors ${
                          isLogisticsAdded
                            ? "bg-amber-50/40 hover:bg-amber-100/40 border-l-2 border-l-amber-500"
                            : "hover:bg-slate-50/50"
                        }`}
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
                          {/* Visual Indicator for appended items */}
                          {isLogisticsAdded && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium mt-1.5 inline-block">
                              Added by Logistics
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="p-1">{item.reason}</TableCell>
                        <TableCell className="text-center font-medium text-slate-700">
                          {item.request_qty}
                        </TableCell>

                        {/* 1. Returned Floor Qty Entry */}
                        <TableCell
                          className={
                            isLogisticsAdded ? "p-1" : "bg-slate-50/30 p-1"
                          }
                        >
                          <div className="flex items-center justify-center gap-1 max-w-[85px] mx-auto">
                            <Input
                              type="number"
                              className={`h-8 text-xs text-center p-1 ${
                                isLogisticsAdded
                                  ? "bg-amber-50/50 border-amber-300"
                                  : "bg-white"
                              }`}
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
                            {isDiscrepancy && !isLogisticsAdded && (
                              <span title="Quantity Mismatch" className="flex">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 3. Local Row-specific RGS Input */}
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            placeholder="RGS #"
                            className={`h-8 text-xs ${
                              isLogisticsAdded
                                ? "bg-white/60 border-amber-200 focus-visible:ring-amber-500"
                                : ""
                            }`}
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
                            className={`h-8 text-xs ${
                              isLogisticsAdded
                                ? "bg-white/60 border-amber-200 focus-visible:ring-amber-500"
                                : ""
                            }`}
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
