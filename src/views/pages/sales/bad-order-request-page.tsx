import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Eye,
  XCircle,
  Loader2,
  FileText,
  AlertCircle,
  PackageCheck,
  Mail,
  X,
  FileUp,
  Trash2,
} from "lucide-react";

import { supabase, supabaseClients } from "@/config/db";

// Shadcn UI Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// --- Types & Interfaces ---
interface BOInput {
  id: string;
  created_at: string;
  user_id: string;
  company_id: string;
  outlet_name: string;
  bp_code: string;
  workflow_type: "For Disposal" | "Return to Warehouse";
  status: "Pending" | "Approved" | "Rejected";
  current_step:
    | "Sales Input"
    | "Logistics Counting"
    | "Accounting Verification"
    | "AGM Approval"
    | "Completed";
  remarks: string | null;
}

interface BOItem {
  id: string;
  item_code: string;
  item_description: string;
  request_qty: number;
  actual_qty: number | null;
  uom: string;
}

interface BOAttachment {
  id: string;
  filepath: string;
}

interface BPMDOutlet {
  bp_code: string;
  customer_name: string;
}

// Temporary layout item structure before database ingestion
interface NewItemRow {
  item_code: string;
  item_description: string;
  request_qty: number;
  uom: string;
}

const ITEMS_PER_PAGE = 10;

export default function BadOrdersManagement() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL States
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  // Dynamic Workspace Tenant State
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(() =>
    localStorage.getItem("active_workspace_company_id"),
  );

  // Data Pipeline States (Main Instance)
  const [tickets, setTickets] = useState<BOInput[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Autocomplete Outlet Search States (Extension Server)
  const [outletSearch, setOutletSearch] = useState("");
  const [debouncedOutletSearch, setDebouncedOutletSearch] = useState("");
  const [outlets, setOutlets] = useState<BPMDOutlet[]>([]);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState(false);
  const [showOutletDropdown, setShowOutletDropdown] = useState(false);

  // File Upload Queue State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Modal Controllers
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<BOInput | null>(null);
  const [ticketItems, setTicketItems] = useState<BOItem[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<BOAttachment[]>(
    [],
  );
  const [ticketToCancel, setTicketToCancel] = useState<BOInput | null>(null);

  // Form State Layout
  const [formData, setFormData] = useState({
    outlet_name: "",
    bp_code: "",
    workflow_type: "For Disposal" as "For Disposal" | "Return to Warehouse",
    remarks: "",
  });

  // Dynamic SKU Manifest Items Added by Agent
  const [manifestItems, setManifestItems] = useState<NewItemRow[]>([]);
  const [currentItemInput, setCurrentItemInput] = useState<NewItemRow>({
    item_code: "",
    item_description: "",
    request_qty: 1,
    uom: "PCS",
  });

  // --- Sync Workspace Structural Updates ---
  useEffect(() => {
    const handleWorkspaceChange = () => {
      setCurrentCompanyId(localStorage.getItem("active_workspace_company_id"));
    };
    window.addEventListener("workspaceCompanyChanged", handleWorkspaceChange);
    return () =>
      window.removeEventListener(
        "workspaceCompanyChanged",
        handleWorkspaceChange,
      );
  }, []);

  // --- Debounce Autocomplete Outlet Strings ---
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOutletSearch(outletSearch), 300);
    return () => clearTimeout(timer);
  }, [outletSearch]);

  // --- Query Outlets from EXTENSION SERVER ---
  useEffect(() => {
    async function fetchOutlets() {
      const query = debouncedOutletSearch.trim();
      if (query.length < 2) {
        setOutlets([]);
        return;
      }
      setIsSearchingOutlets(true);
      try {
        const { data, error } = await supabaseClients["sales.server.extension"]
          .from("bpmd")
          .select("bp_code, customer_name")
          .or(`customer_name.ilike.%${query}%,bp_code.ilike.%${query}%`)
          .limit(10);

        if (error) throw error;
        setOutlets(data || []);
      } catch (err) {
        console.error("BPMD Lookup Error via Extension Server:", err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }
    fetchOutlets();
  }, [debouncedOutletSearch]);

  // --- Fetch Master Dashboard List (Filtered by active Workspace company_id) ---
  const fetchTickets = useCallback(async () => {
    if (!currentCompanyId) {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase()
        .from("tbl_bo_input")
        .select("*", { count: "exact" })
        .eq("company_id", currentCompanyId);

      if (searchQuery) {
        query = query.or(
          `outlet_name.ilike.%${searchQuery}%,bp_code.ilike.%${searchQuery}%`,
        );
      }

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setTickets(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch bad order pipelines");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, currentCompanyId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // --- Fetch Ticket Details ---
  const handleViewDetails = async (ticket: BOInput) => {
    setSelectedTicket(ticket);
    setIsViewOpen(true);
    try {
      const itemsPromise = supabase()
        .from("tbl_bo_input_items")
        .select("*")
        .eq("bo_input_id", ticket.id);
      const attachmentsPromise = supabase()
        .from("tbl_bo_attachments")
        .select("*")
        .eq("bo_input_id", ticket.id);

      const [itemsRes, attachmentsRes] = await Promise.all([
        itemsPromise,
        attachmentsPromise,
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (attachmentsRes.error) throw attachmentsRes.error;

      setTicketItems(itemsRes.data || []);
      setTicketAttachments(attachmentsRes.data || []);
    } catch (err: any) {
      toast.error("Failed to parse document information details");
    }
  };

  // --- Handle SKU Row Generation locally ---
  const addSKUToManifest = () => {
    if (
      !currentItemInput.item_code.trim() ||
      !currentItemInput.item_description.trim()
    ) {
      return toast.error(
        "Please explicitly write code and descriptions for this target item row.",
      );
    }
    if (currentItemInput.request_qty <= 0) {
      return toast.error("Requested quantities must scale above zero units.");
    }
    setManifestItems((prev) => [...prev, currentItemInput]);
    setCurrentItemInput({
      item_code: "",
      item_description: "",
      request_qty: 1,
      uom: "PCS",
    });
  };

  const removeSKUFromManifest = (idx: number) => {
    setManifestItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // --- File Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // --- Form Insertion Lifecycle ---
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompanyId)
      return toast.error("No active business entity workspace selected.");
    if (!formData.bp_code)
      return toast.error(
        "Please assign a client record using the autocomplete search dropdown.",
      );
    if (manifestItems.length === 0)
      return toast.error(
        "You must append at least one SKU to the manifest queue before filing.",
      );

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      if (!user)
        throw new Error("No active authentication session discovered.");

      const initialStep =
        formData.workflow_type === "For Disposal"
          ? "Accounting Verification"
          : "Logistics Counting";

      // 1. Insert base ticket log
      const { data: insertedTicket, error: ticketError } = await supabase()
        .from("tbl_bo_input")
        .insert([
          {
            ...formData,
            user_id: user.id,
            company_id: currentCompanyId,
            status: "Pending",
            current_step: initialStep,
          },
        ])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 2. Insert SKU Manifest items associated directly with newly created parent entity index
      const itemPayloads = manifestItems.map((item) => ({
        bo_input_id: insertedTicket.id,
        item_code: item.item_code.trim(),
        item_description: item.item_description.trim(),
        request_qty: item.request_qty,
        uom: item.uom,
      }));

      const { error: itemsError } = await supabase()
        .from("tbl_bo_input_items")
        .insert(itemPayloads);
      if (itemsError) throw itemsError;

      // 3. Batch upload document binary streams
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileName = `${insertedTicket.id}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
          const filePath = `attachments/${fileName}`;

          const { error: uploadError } = await supabase()
            .storage.from("bad-orders-attachments")
            .upload(filePath, file);
          if (uploadError) throw uploadError;

          const { error: attDbError } = await supabase()
            .from("tbl_bo_attachments")
            .insert([{ bo_input_id: insertedTicket.id, filepath: filePath }]);
          if (attDbError) throw attDbError;
        }
      }

      toast.success(
        "Bad Order workflow successfully logged and manifest bound.",
      );
      setIsCreateOpen(false);

      // State reset
      setFormData({
        outlet_name: "",
        bp_code: "",
        workflow_type: "For Disposal",
        remarks: "",
      });
      setManifestItems([]);
      setOutletSearch("");
      setSelectedFiles([]);
      fetchTickets();
    } catch (err: any) {
      toast.error(err.message || "Pipeline processing execution failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Safe Soft-Cancel Workflow Instead of hard mutations ---
  const handleCancelConfirm = async () => {
    if (!ticketToCancel) return;
    setIsSubmitting(true);
    try {
      const cancellationRemarks =
        `${ticketToCancel.remarks || ""} (Voided and Canceled by Sales Agent)`.trim();

      const { error } = await supabase()
        .from("tbl_bo_input")
        .update({
          status: "Rejected",
          current_step: "Completed",
          remarks: cancellationRemarks,
        })
        .eq("id", ticketToCancel.id);

      if (error) throw error;

      toast.success(
        "Ticket successfully canceled and workflow set to terminated.",
      );
      setIsCancelModalOpen(false);
      fetchTickets();
    } catch (err: any) {
      toast.error("Failed to cancel target order reference.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-5 p-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Bad Orders & Returns Routing
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage return lifecycles, logistical items audit tracking, and
          cross-department approvals.
        </p>
      </div>

      {!currentCompanyId && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            Use the sidebar company switcher component to navigate your
            authorized structural entities.
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter accounts or bp code..."
            value={searchQuery}
            disabled={!currentCompanyId}
            onChange={(e) =>
              setSearchParams((p) => {
                e.target.value
                  ? p.set("search", e.target.value)
                  : p.delete("search");
                p.set("page", "1");
                return p;
              })
            }
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          disabled={!currentCompanyId}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Log Bad Order / Return
        </Button>
      </div>

      {/* Main Table View */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date Filed</TableHead>
              <TableHead>BP Code</TableHead>
              <TableHead>Outlet Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Workflow Step</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground"
                >
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />{" "}
                  Loading records pipeline...
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No active returns currently registered for this entity.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="text-xs">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {ticket.bp_code}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {ticket.outlet_name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ticket.workflow_type === "For Disposal"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {ticket.workflow_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span
                        className={`w-2 h-2 rounded-full ${ticket.status === "Rejected" ? "bg-slate-400" : "bg-primary animate-pulse"}`}
                      />
                      {ticket.current_step}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${
                        ticket.status === "Approved"
                          ? "bg-green-100 text-green-700"
                          : ticket.status === "Rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleViewDetails(ticket)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {ticket.status === "Pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="Cancel Workflow"
                          onClick={() => {
                            setTicketToCancel(ticket);
                            setIsCancelModalOpen(true);
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- DETAILS DIALOG --- */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Detail Manifest View
              — {selectedTicket?.bp_code}
            </DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-5 my-2">
              <div className="grid grid-cols-2 gap-4 text-sm border-b pb-4">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Customer Account Name:
                  </span>
                  <span className="font-semibold text-primary">
                    {selectedTicket.outlet_name}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Remarks Log:
                  </span>
                  <span className="text-xs text-slate-600 block italic">
                    {selectedTicket.remarks || "No input notes written."}
                  </span>
                </div>
              </div>

              {/* Attachments Mapping */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Filed Attachments ({ticketAttachments.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ticketAttachments.map((att) => (
                    <a
                      key={att.id}
                      href={`${supabase().storage.from("bad-orders-attachments").getPublicUrl(att.filepath).data.publicUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 p-2 border rounded-md hover:bg-slate-50 text-xs text-slate-600 truncate"
                    >
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="truncate">View Attachment File</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 pt-2">
                <h4 className="text-sm font-semibold">
                  SKU Return Manifest Check
                </h4>
                <div className="border rounded">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Req Qty</TableHead>
                        <TableHead className="text-center">
                          Actual Qty
                        </TableHead>
                        <TableHead>UOM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketItems.map((item) => (
                        <TableRow key={item.id}>
                          <td className="p-2 font-mono text-xs">
                            {item.item_code}
                          </td>
                          <td className="p-2 text-xs truncate max-w-[200px]">
                            {item.item_description}
                          </td>
                          <td className="p-2 text-center font-medium">
                            {item.request_qty}
                          </td>
                          <td className="p-2 text-center text-xs italic text-muted-foreground">
                            {item.actual_qty ?? "Pending Validation"}
                          </td>
                          <td className="p-2 text-xs">{item.uom}</td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- CREATE WORKFLOW DIALOG WITH DYNAMIC SKU COMPONENT --- */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setSelectedFiles([]);
            setOutletSearch("");
            setManifestItems([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Bad Order Manifest</DialogTitle>
            <DialogDescription>
              Input target structural fields and build a detailed SKU ledger
              manifest below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div className="space-y-1 relative">
              <label className="text-xs font-medium">
                Search Outlet (Extension Master)
              </label>
              <Input
                required
                placeholder="Type at least 2 characters to lookup..."
                value={outletSearch}
                onChange={(e) => {
                  setOutletSearch(e.target.value);
                  setShowOutletDropdown(true);
                  if (!e.target.value)
                    setFormData((p) => ({
                      ...p,
                      outlet_name: "",
                      bp_code: "",
                    }));
                }}
              />
              {showOutletDropdown && outlets.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md p-1">
                  {outlets.map((outlet) => (
                    <div
                      key={outlet.bp_code}
                      className="p-2 text-xs hover:bg-accent rounded-sm cursor-pointer"
                      onClick={() => {
                        setFormData((p) => ({
                          ...p,
                          outlet_name: outlet.customer_name,
                          bp_code: outlet.bp_code,
                        }));
                        setOutletSearch(
                          `${outlet.customer_name} (${outlet.bp_code})`,
                        );
                        setShowOutletDropdown(false);
                      }}
                    >
                      <div className="font-medium">{outlet.customer_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {outlet.bp_code}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {formData.bp_code && (
              <div className="bg-slate-50 p-2.5 rounded border border-dashed flex justify-between items-center text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Mapped Code:</span>{" "}
                  <b className="text-primary">{formData.bp_code}</b>
                </div>
                <div className="text-blue-600 font-sans font-semibold text-[11px] bg-blue-50 px-1.5 py-0.5 rounded">
                  Linked Master Record ✓
                </div>
              </div>
            )}

            {/* SKU MANIFEST CONSOLE CREATOR CONTAINER */}
            <div className="border rounded-lg p-3 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Dynamic SKU Manifest Ledger Builder
              </h4>
              <div className="grid grid-cols-4 gap-2 items-end">
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Item Code
                  </label>
                  <Input
                    placeholder="e.g., SKU-101"
                    value={currentItemInput.item_code}
                    onChange={(e) =>
                      setCurrentItemInput((p) => ({
                        ...p,
                        item_code: e.target.value,
                      }))
                    }
                    className="bg-background"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Description
                  </label>
                  <Input
                    placeholder="Product name or label details"
                    value={currentItemInput.item_description}
                    onChange={(e) =>
                      setCurrentItemInput((p) => ({
                        ...p,
                        item_description: e.target.value,
                      }))
                    }
                    className="bg-background"
                  />
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Qty / UOM
                  </label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min="1"
                      value={currentItemInput.request_qty}
                      onChange={(e) =>
                        setCurrentItemInput((p) => ({
                          ...p,
                          request_qty: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      className="bg-background w-14 p-1 text-center"
                    />
                    <Input
                      placeholder="PCS"
                      value={currentItemInput.uom}
                      onChange={(e) =>
                        setCurrentItemInput((p) => ({
                          ...p,
                          uom: e.target.value.toUpperCase(),
                        }))
                      }
                      className="bg-background w-14 p-1 text-center"
                    />
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full text-xs font-semibold"
                onClick={addSKUToManifest}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Append SKU Row to Manifest
              </Button>

              {/* Real-time added manifest list queue table view */}
              {manifestItems.length > 0 && (
                <div className="border rounded bg-background max-h-36 overflow-y-auto text-xs mt-2">
                  <Table>
                    <TableHeader className="bg-slate-100">
                      <TableRow>
                        <TableHead className="p-1.5">Code</TableHead>
                        <TableHead className="p-1.5">Desc</TableHead>
                        <TableHead className="p-1.5 text-center">Qty</TableHead>
                        <TableHead className="p-1.5 w-8 text-center" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manifestItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <td className="p-1.5 font-mono">{item.item_code}</td>
                          <td className="p-1.5 truncate max-w-[180px]">
                            {item.item_description}
                          </td>
                          <td className="p-1.5 text-center font-bold text-primary">
                            {item.request_qty} {item.uom}
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeSKUFromManifest(idx)}
                              className="text-destructive hover:scale-105 transition-transform"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Workflow Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block">
                Strategic Route Assignment
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      workflow_type: "For Disposal",
                    }))
                  }
                  className={`p-2.5 rounded-lg border cursor-pointer text-center space-y-1 transition-all ${formData.workflow_type === "For Disposal" ? "border-orange-500 bg-orange-50/40" : "hover:bg-muted"}`}
                >
                  <div className="text-xs font-bold text-orange-600">
                    For Direct Disposal
                  </div>
                </div>
                <div
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      workflow_type: "Return to Warehouse",
                    }))
                  }
                  className={`p-2.5 rounded-lg border cursor-pointer text-center space-y-1 transition-all ${formData.workflow_type === "Return to Warehouse" ? "border-blue-500 bg-blue-50/40" : "hover:bg-muted"}`}
                >
                  <div className="text-xs font-bold text-blue-600">
                    Return to Stock
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments Upload section */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Claims Attachments Documentation
              </label>
              <div className="border-2 border-dashed rounded-lg p-3 hover:bg-slate-50/50 relative flex flex-col items-center justify-center gap-1">
                <Input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept="image/*,application/pdf"
                />
                <FileUp className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-slate-600">
                  Bundle continuous document file arrays here
                </span>
              </div>
              {selectedFiles.length > 0 && (
                <div className="max-h-20 overflow-y-auto space-y-1 text-xs">
                  {selectedFiles.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-muted/60 p-1 rounded font-mono text-[11px]"
                    >
                      <span className="truncate max-w-[480px]">
                        {file.name}
                      </span>
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          setSelectedFiles((p) =>
                            p.filter((_, idx) => idx !== i),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Initial Manifest Remarks
              </label>
              <Input
                placeholder="Note explicit defects here..."
                value={formData.remarks}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, remarks: e.target.value }))
                }
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}{" "}
                File Form Manifest
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- CANCELLATION MODAL (NO DELETION RULE COMPLIANCE) --- */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Terminate Active Workflow
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel return request{" "}
              <b className="text-foreground">{ticketToCancel?.bp_code}</b>? This
              updates its workflow state to terminated and marks the document
              context status as{" "}
              <span className="font-semibold text-red-600">Rejected</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={isSubmitting}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
