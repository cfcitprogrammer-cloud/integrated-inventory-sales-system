// pages/bad-orders/CreateBadOrderPage.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Trash2,
  Loader2,
  FileUp,
  X,
  Search,
  AlertTriangleIcon,
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
  emailNotifierUtil,
  type DisposalItem,
  type DisposalRequestPayload,
} from "@/lib/email-notifier";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ExtensionProductVariant {
  item_code: string;
  item_description: string;
  uom: string | null;
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

export default function CreateBadOrderPage() {
  const navigate = useNavigate();
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Click Outside Refs ---
  const outletRef = useRef<HTMLDivElement>(null);
  const skuRef = useRef<HTMLDivElement>(null);

  // --- Outlet Autocomplete States ---
  const [outletSearch, setOutletSearch] = useState("");
  const [debouncedOutletSearch, setDebouncedOutletSearch] = useState("");
  const [outlets, setOutlets] = useState<any[]>([]);
  const [showOutletDropdown, setShowOutletDropdown] = useState(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState(false);

  // --- SKU Autocomplete States ---
  const [skuSearch, setSkuSearch] = useState("");
  const [debouncedSkuSearch, setDebouncedSkuSearch] = useState("");
  const [variants, setVariants] = useState<ExtensionProductVariant[]>([]);
  const [showSkuDropdown, setShowSkuDropdown] = useState(false);
  const [isSearchingSkus, setIsSearchingSkus] = useState(false);

  // --- Form Payload Base ---
  const [formData, setFormData] = useState({
    outlet_name: "",
    bp_code: "",
    workflow_type: "For Disposal" as "For Disposal" | "Return to Warehouse",
    remarks: "",
  });

  // --- Manifest Ledger Arrays ---
  const [manifestItems, setManifestItems] = useState<DisposalItem[]>([]);
  const [currentItem, setCurrentItem] = useState<DisposalItem>({
    item_code: "",
    item_description: "",
    uom: "PCS",
    request_qty: 1,
    expiration_date: null,
    reason: "",
  });

  // State tracking specific custom reason if 'others' is picked
  const [customReason, setCustomReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!currentCompanyId) {
      toast.error(
        "No active business entity selected. Returning to dashboard.",
      );
      navigate("/d/sales/bo/1");
    }
  }, [currentCompanyId, navigate]);

  // --- Click Outside Dropdowns Handler ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        outletRef.current &&
        !outletRef.current.contains(event.target as Node)
      ) {
        setShowOutletDropdown(false);
      }
      if (skuRef.current && !skuRef.current.contains(event.target as Node)) {
        setShowSkuDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Debounce Timers ---
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOutletSearch(outletSearch), 300);
    return () => clearTimeout(t);
  }, [outletSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSkuSearch(skuSearch), 300);
    return () => clearTimeout(t);
  }, [skuSearch]);

  // --- Query Outlets from Extension Server ---
  useEffect(() => {
    async function queryOutlets() {
      const q = debouncedOutletSearch.trim();
      if (q.length < 2 || formData.bp_code) return;
      setIsSearchingOutlets(true);
      try {
        const { data } = await supabaseClients["sales.server.extension"]
          .from("bpmd")
          .select("bp_code, customer_name")
          .or(`customer_name.ilike.%${q}%,bp_code.ilike.%${q}%`)
          .limit(8);
        setOutlets(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }
    queryOutlets();
  }, [debouncedOutletSearch, formData.bp_code]);

  // --- Query Product Variants from Extension Server ---
  useEffect(() => {
    async function querySkus() {
      const q = debouncedSkuSearch.trim();
      if (q.length < 2 || currentItem.item_code) return;
      setIsSearchingSkus(true);
      try {
        // Corrected .or() filter syntax with `%` on both sides
        const { data, error } = await supabase()
          .from("tbl_bo_products")
          .select("item_code, item_description, uom")
          .or(`item_description.ilike.%${q}%,item_code.ilike.%${q}%`)
          .limit(30);

        if (error) throw error;
        setVariants((data as unknown as ExtensionProductVariant[]) || []);
      } catch (err) {
        console.error("SKU database lookup error:", err);
      } finally {
        setIsSearchingSkus(false);
      }
    }
    querySkus();
  }, [debouncedSkuSearch, currentItem.item_code]);

  const addSKURow = () => {
    if (!currentItem.item_code || !currentItem.item_description) {
      return toast.error(
        "Please pick a valid variant from the autocomplete dropdown menu.",
      );
    }
    if (currentItem.request_qty <= 0) {
      return toast.error(
        "Filing volume vectors must be greater than zero units.",
      );
    }
    if (!currentItem.reason) {
      return toast.error("Please specify a reason for this bad order item.");
    }
    if (!currentItem.expiration_date) {
      return toast.error("Please specify an expiration date");
    }

    // Finalize reason calculation if using specified alternative string
    const finalizedReason =
      currentItem.reason === "others, please specify"
        ? customReason.trim() || "Other Reason"
        : currentItem.reason;

    const completedItemPayload: DisposalItem = {
      ...currentItem,
      reason: finalizedReason,
    };

    setManifestItems((p) => [...p, completedItemPayload]);

    // Clean states for the next item lookup entry
    setCurrentItem({
      item_code: "",
      item_description: "",
      uom: "PCS",
      request_qty: 1,
      expiration_date: null,
      reason: "",
    });
    setCustomReason("");
    setSkuSearch("");
  };

  const handleFormSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bp_code)
      return toast.error(
        "Please match an outlet from the master dropdown list.",
      );
    if (manifestItems.length === 0)
      return toast.error("Please append at least one SKU to the return table.");

    // 👇 ADD THIS NEW ATTACHMENT VALIDATION CHECK
    if (files.length === 0) {
      return toast.error(
        "Please attach at least one proof or validation document before requesting.",
      );
    }

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      if (!user) throw new Error("Authentication state missing.");

      // Fetch employee master record for full name parameters
      const { data: employeeData } = await supabase()
        .from("tbl_employees")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      console.log(employeeData);

      // 1. Insert Master Ticket Layout
      const { data: ticket, error: tErr } = await supabase()
        .from("tbl_bo_input")
        .insert([
          {
            ...formData,
            user_id: user.id,
            company_id: currentCompanyId,
            status: "Open",
          },
        ])
        .select()
        .single();

      if (tErr) throw tErr;

      // 2. Insert SKUs / Child Items Profile
      const skus = manifestItems.map((m) => ({ ...m, bo_input_id: ticket.id }));
      const { error: iErr } = await supabase()
        .from("tbl_bo_input_items")
        .insert(skus);
      if (iErr) throw iErr;

      // Array to temporarily hold file metadata for the email payload pipeline
      const uploadedAttachments: { name: string; url: string }[] = [];

      await supabase()
        .from("tbl_bo_workflow")
        .insert([
          { bo_input_id: ticket.id, workflow_type: formData.workflow_type },
        ]);

      // 3. Process File Stream Uploads to Supabase Storage Bucket
      if (files.length > 0) {
        for (const f of files) {
          const path = `attachments/${ticket.id}/${crypto.randomUUID()}.${f.name.split(".").pop()}`;

          // Upload file binary data
          const { error: uploadErr } = await supabase()
            .storage.from("bad-orders-attachments")
            .upload(path, f);

          if (uploadErr) throw uploadErr;

          // Save reference track row to attachments table
          await supabase()
            .from("tbl_bo_attachments")
            .insert([{ bo_input_id: ticket.id, file_path: path }]);

          // Fetch the instant Public URL string out of your storage bucket policy configuration
          const { data: urlData } = supabase()
            .storage.from("bad-orders-attachments")
            .getPublicUrl(path);

          if (urlData?.publicUrl) {
            uploadedAttachments.push({
              name: f.name,
              url: urlData.publicUrl,
            });
          }
        }
      }

      toast.success("Bad Order requested successfully.");

      // 4. Construct complete operational payload strictly adhering to DisposalRequestPayload
      const operationalPayload: DisposalRequestPayload = {
        requestId: String(ticket.id),
        customerName: ticket.outlet_name,
        bpCode: ticket.bp_code,
        status: ticket.status || "Open",
        dateTime: new Date(ticket.created_at || Date.now()).toLocaleString(),
        remarks: ticket.remarks || "No remarks filed.",
        filer: {
          first_name: employeeData?.first_name || "System",
          last_name: employeeData?.last_name || "Operator",
        },
        items: manifestItems,
        attachments: uploadedAttachments,
      };

      // Target explicit initial workflow entry methods matching your model execution definitions
      if (formData.workflow_type === "For Disposal") {
        emailNotifierUtil.sendDirectDisposalToAccounting(operationalPayload);
      } else {
        emailNotifierUtil.sendReturnToWHToLogistics(operationalPayload);
      }

      navigate("/d/sales/bo/1");
    } catch (err: any) {
      toast.error(
        err.message ||
          "Failed to finalize document filing processing execution.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Request Bad Order
          </h1>
          <p className="text-xs text-muted-foreground">
            Fill up your bad orders here.
          </p>
        </div>
      </div>

      <form onSubmit={handleFormSubmission} className="space-y-5">
        {/* --- CUSTOMER OUTLET AUTOCOMPLETE --- */}
        <div ref={outletRef} className="space-y-1 relative">
          <label className="text-xs font-semibold text-slate-700">
            Distributor Name
          </label>
          <div className="relative">
            <Input
              required
              placeholder="Type distributor name or BP code..."
              value={outletSearch}
              onChange={(e) => {
                setOutletSearch(e.target.value);
                setShowOutletDropdown(true);
                if (!e.target.value) {
                  setFormData((p) => ({ ...p, outlet_name: "", bp_code: "" }));
                  setOutlets([]);
                } else if (formData.bp_code) {
                  setFormData((p) => ({ ...p, outlet_name: "", bp_code: "" }));
                }
              }}
              onFocus={() => setShowOutletDropdown(true)}
            />
            {isSearchingOutlets && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {showOutletDropdown && outletSearch.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md p-1">
              {outlets.length === 0 && !isSearchingOutlets ? (
                <div className="p-3 text-xs text-center text-muted-foreground">
                  No outlets found
                </div>
              ) : (
                outlets.map((o) => (
                  <div
                    key={o.bp_code}
                    className="p-2 text-xs hover:bg-accent rounded-sm cursor-pointer"
                    onClick={() => {
                      setFormData((p) => ({
                        ...p,
                        outlet_name: o.customer_name,
                        bp_code: o.bp_code,
                      }));
                      setOutletSearch(o.customer_name);
                      setShowOutletDropdown(false);
                    }}
                  >
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {o.bp_code}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* --- WORKFLOW TYPE SELECTION --- */}
        <div className="space-y-2">
          <label className="text-xs font-semibold block text-slate-700">
            Route Assignment
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() =>
                setFormData((p) => ({ ...p, workflow_type: "For Disposal" }))
              }
              className={`p-3 rounded-lg border cursor-pointer text-center space-y-1 transition-all ${
                formData.workflow_type === "For Disposal"
                  ? "border-orange-500 bg-orange-50/30 ring-1 ring-orange-500"
                  : "bg-card hover:bg-slate-50"
              }`}
            >
              <div className="text-xs font-bold text-orange-600">
                For Direct Disposal
              </div>
              <p className="text-[10px] text-muted-foreground">
                Skips Logistics counting. Proceed for disposal.
              </p>
            </div>
            <div
              onClick={() =>
                setFormData((p) => ({
                  ...p,
                  workflow_type: "Return to Warehouse",
                }))
              }
              className={`p-3 rounded-lg border cursor-pointer text-center space-y-1 transition-all ${
                formData.workflow_type === "Return to Warehouse"
                  ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
                  : "bg-card hover:bg-slate-50"
              }`}
            >
              <div className="text-xs font-bold text-blue-600">
                Return to Warehouse
              </div>
              <p className="text-[10px] text-muted-foreground">
                Routes to Logistics counting validation first.
              </p>
            </div>
          </div>
        </div>

        {/* --- SKU PRODUCT VARIANT MANIFEST CONSOLE WITH AUTOCOMPLETE LOOKUP --- */}
        <div className="border rounded-xl p-4 space-y-3 bg-slate-50/50">
          <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
            Item Ledger Builder
          </h3>

          <div ref={skuRef} className="space-y-2 relative">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">
              Search Catalog SKU
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product name, code, or alias..."
                value={skuSearch}
                className="pl-9 bg-background"
                onChange={(e) => {
                  setSkuSearch(e.target.value);
                  setShowSkuDropdown(true);
                  if (!e.target.value) {
                    setCurrentItem((p) => ({
                      ...p,
                      item_code: "",
                      item_description: "",
                    }));
                    setVariants([]);
                  } else if (currentItem.item_code) {
                    setCurrentItem((p) => ({
                      ...p,
                      item_code: "",
                      item_description: "",
                    }));
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
                        <div className="text-[10px] text-muted-foreground font-mono flex gap-2">
                          <span>SKU: {v.item_code}</span>
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

          {/* Configuration Grid for Selected SKU */}
          {currentItem.item_code && (
            <div className="space-y-3 bg-background p-3 rounded border border-dashed transition-all animate-in fade-in duration-200">
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">
                  {currentItem.item_code}
                </span>
                <span className="font-semibold text-xs text-slate-800">
                  {currentItem.item_description}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* 1. Request Quantity */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 block">
                    Filing Qty ({currentItem.uom})
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={currentItem.request_qty}
                    onChange={(e) =>
                      setCurrentItem((p) => ({
                        ...p,
                        request_qty: Math.max(
                          1,
                          parseInt(e.target.value, 10) || 1,
                        ),
                      }))
                    }
                    className="h-8 font-bold"
                  />
                </div>

                {/* 2. Expiration Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 block">
                    Expiration Date
                  </label>
                  <Input
                    type="date"
                    value={currentItem.expiration_date || ""}
                    onChange={(e) =>
                      setCurrentItem((p) => ({
                        ...p,
                        expiration_date: e.target.value || null,
                      }))
                    }
                    className="h-8 text-slate-700"
                  />
                </div>

                {/* 3. Reason Dropdown */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 block">
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
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              </div>

              {/* Dynamic Sub-input if "others, please specify" is caught */}
              {currentItem.reason === "others, please specify" && (
                <div className="space-y-1 pt-1 border-t border-slate-100 transition-all animate-in slide-in-from-top-1 duration-150">
                  <label className="text-[10px] font-medium text-amber-700 block">
                    Please Specify Custom Reason
                  </label>
                  <Input
                    placeholder="Describe issue (e.g. Water logged / Factory seal breakdown)"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="h-8 border-amber-300 focus-visible:ring-amber-500 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full text-xs font-semibold"
            disabled={!currentItem.item_code}
            onClick={addSKURow}
          >
            Append Product
          </Button>

          {/* Table Memory Ledger */}
          {manifestItems.length > 0 && (
            <div className="border rounded-md bg-background max-h-56 overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="p-2 text-xs">
                      SKU/Description
                    </TableHead>
                    <TableHead className="p-2 text-xs">Expiry</TableHead>
                    <TableHead className="p-2 text-xs">Reason</TableHead>
                    <TableHead className="p-2 text-xs text-center">
                      Volume
                    </TableHead>
                    <TableHead className="p-2 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifestItems.map((item, idx) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="p-2">
                        <div className="font-mono font-medium">
                          {item.item_code}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                          {item.item_description}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 font-mono text-slate-600">
                        {item.expiration_date ? item.expiration_date : "—"}
                      </TableCell>
                      <TableCell className="p-2 capitalize text-slate-600 max-w-[140px] truncate">
                        {item.reason}
                      </TableCell>
                      <TableCell className="p-2 text-center font-bold text-primary whitespace-nowrap">
                        {item.request_qty} {item.uom}
                      </TableCell>
                      <TableCell className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setManifestItems((p) =>
                              p.filter((_, i) => i !== idx),
                            )
                          }
                          className="text-destructive hover:scale-105 transition-transform"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* --- ATTACHMENTS DOCUMENTATION --- */}
        <div className="space-y-1">
          <label className="text-xs font-medium">
            Claims Attachments Documentation
          </label>
          <div className="border-2 border-dashed rounded-lg p-4 hover:bg-slate-50 transition-colors relative flex flex-col items-center justify-center gap-1">
            <Input
              type="file"
              multiple
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) =>
                e.target.files &&
                setFiles((p) => [...p, ...Array.from(e.target.files!)])
              }
              accept="image/*,application/pdf"
            />
            <FileUp className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-slate-500">
              Drop claim files or references here
            </span>
          </div>
          {files.length > 0 && (
            <div className="space-y-1 pt-1 max-h-24 overflow-y-auto">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center bg-muted p-1.5 rounded text-[11px] font-mono"
                >
                  <span className="truncate max-w-[400px]">{file.name}</span>
                  <X
                    className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setFiles((p) => p.filter((_, i) => i !== idx))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Alert className="max-w-full border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          <AlertTriangleIcon />
          <AlertTitle>Mahalagang Paalala</AlertTitle>
          <AlertDescription>
            Maaring mag-attach ng Validation Form at Proof of Disposal na may
            kumpleto at tamang detalye.
          </AlertDescription>
        </Alert>

        {/* --- FORM GENERAL REMARKS --- */}
        <div className="space-y-1">
          <label className="text-xs font-medium">
            Initial Manifest Remarks
          </label>
          <Input
            placeholder="Note defects here (e.g. Broken sealing arrays)"
            value={formData.remarks}
            onChange={(e) =>
              setFormData((p) => ({ ...p, remarks: e.target.value }))
            }
          />
        </div>

        {/* --- FORM ACTION BUTTONS --- */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("d/sales/bo/1")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Request Bad Order
          </Button>
        </div>
      </form>
    </div>
  );
}
