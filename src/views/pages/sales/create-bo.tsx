// pages/bad-orders/CreateBadOrderPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  FileUp,
  X,
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
import { emailNotifierUtil } from "@/lib/email-notifier";

interface NewItemRow {
  item_code: string;
  item_description: string;
  request_qty: number;
  uom: string;
}

interface ExtensionProductVariant {
  sku: string;
  name: string;
  alias: string | null;
  uom: string | null;
  products: {
    name: string;
    category: string | null;
  };
}

export default function CreateBadOrderPage() {
  const navigate = useNavigate();
  const [currentCompanyId] = useState(() =>
    localStorage.getItem("active_workspace_company_id"),
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const [manifestItems, setManifestItems] = useState<NewItemRow[]>([]);
  const [currentItem, setCurrentItem] = useState<NewItemRow>({
    item_code: "",
    item_description: "",
    request_qty: 1,
    uom: "PCS",
  });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!currentCompanyId) {
      toast.error(
        "No active business entity selected. Returning to dashboard.",
      );
      navigate("/bad-orders");
    }
  }, [currentCompanyId, navigate]);

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

  // --- Query Product Variants from Extension Server (Using your exact parameters) ---
  useEffect(() => {
    async function querySkus() {
      const q = debouncedSkuSearch.trim();
      if (q.length < 2 || currentItem.item_code) return;
      setIsSearchingSkus(true);
      try {
        const { data, error } = await supabaseClients["sales.server.extension"]
          .from("product_variant")
          .select(
            `
            sku,
            name,
            alias,
            uom,
            products!inner (
              name,
              category
            )
          `,
          )
          .or(`name.ilike.%${q}%,sku.ilike.%${q}%,alias.ilike.%${q}%`)
          .limit(15);

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

    setManifestItems((p) => [...p, currentItem]);

    // Clean states for the next item lookup entry
    setCurrentItem({
      item_code: "",
      item_description: "",
      request_qty: 1,
      uom: "PCS",
    });
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

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      if (!user) throw new Error("Authentication state missing.");

      const initialWorkflowStep =
        formData.workflow_type === "For Disposal"
          ? "Accounting Verification"
          : "Logistics Counting";

      // 1. Insert Master Ticket Layout
      const { data: ticket, error: tErr } = await supabase()
        .from("tbl_bo_input")
        .insert([
          {
            ...formData,
            user_id: user.id,
            company_id: currentCompanyId,
            status: "Pending",
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

      console.log(files);

      // Array to temporarily hold file metadata for the email payload pipeline
      const uploadedAttachments: { name: string; url: string }[] = [];

      await supabase()
        .from("tbl_bo_workflow")
        .insert([{ bo_input_id: ticket.id, workflow_type: "" }]);

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

      toast.success(
        "Manifest successfully initiated inside system routing pipelines.",
      );

      if (formData.workflow_type === "For Disposal") {
        // 4. Fire-and-Forget Email Notification Service (Non-blocking step)
        // Only fire email if workflow matches the direct disposal route parameter rules
        emailNotifierUtil.sendDirectDisposalAlert({
          requestId: String(ticket.id),
          submittedBy:
            user.user_metadata?.full_name || user.email || "System Operator",
          department: "Logistics/Warehouse Operations",
          dateTime: new Date(ticket.created_at || Date.now()).toLocaleString(),
          warehouseLocation: "Central Sorting Hub",
          // Format layout parameters explicitly to match your DisposalItem interface typing configurations
          items: manifestItems.map((m) => ({
            sku: m.item_code,
            description: m.item_description,
            uom: m.uom,
            qty: Number(m.request_qty),
          })),
          attachments: uploadedAttachments, // Injected dynamic public cloud URLs
          remarks: ticket.remarks,
          customerName: ticket.outlet_name,
        });
      } else {
        alert("HEY");
        emailNotifierUtil.sendReturnToWHAlert({
          requestId: String(ticket.id),
          submittedBy:
            user.user_metadata?.full_name || user.email || "System Operator",
          department: "Logistics/Warehouse Operations",
          dateTime: new Date(ticket.created_at || Date.now()).toLocaleString(),
          warehouseLocation: "Central Sorting Hub",
          // Format layout parameters explicitly to match your DisposalItem interface typing configurations
          items: manifestItems.map((m) => ({
            sku: m.item_code,
            description: m.item_description,
            uom: m.uom,
            qty: Number(m.request_qty),
          })),
          attachments: uploadedAttachments, // Injected dynamic public cloud URLs
          remarks: ticket.remarks,
          customerName: ticket.outlet_name,
        });
      }

      // navigate("/bad-orders");
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
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Log Bad Order / Return Request
          </h1>
          <p className="text-xs text-muted-foreground">
            Build SKU logs and declare dynamic department targets.
          </p>
        </div>
      </div>

      <form onSubmit={handleFormSubmission} className="space-y-5">
        {/* --- CUSTOMER OUTLET AUTOCOMPLETE --- */}
        <div className="space-y-1 relative">
          <label className="text-xs font-semibold text-slate-700">
            Account Client Lookup
          </label>
          <div className="relative">
            <Input
              required
              placeholder="Type customer name or BP code string..."
              value={outletSearch}
              onChange={(e) => {
                setOutletSearch(e.target.value);
                setShowOutletDropdown(true);
                if (!e.target.value)
                  setFormData((p) => ({ ...p, outlet_name: "", bp_code: "" }));
              }}
              onFocus={() => setShowOutletDropdown(true)}
            />
            {isSearchingOutlets && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {showOutletDropdown && outlets.length > 0 && (
            <div className="absolute left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto rounded-md border bg-popover shadow-md p-1">
              {outlets.map((o) => (
                <div
                  key={o.card_code}
                  className="p-2 text-xs hover:bg-accent rounded-sm cursor-pointer"
                  onClick={() => {
                    setFormData((p) => ({
                      ...p,
                      outlet_name: o.customer_name,
                      bp_code: o.bp_code,
                    }));
                    setOutletSearch(`${o.customer_name} (${o.bp_code})`);
                    setShowOutletDropdown(false);
                  }}
                >
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {o.bp_code}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- WORKFLOW TYPE SELECTION --- */}
        <div className="space-y-2">
          <label className="text-xs font-semibold block text-slate-700">
            Strategic Route Assignment
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() =>
                setFormData((p) => ({ ...p, workflow_type: "For Disposal" }))
              }
              className={`p-3 rounded-lg border cursor-pointer text-center space-y-1 ${formData.workflow_type === "For Disposal" ? "border-orange-500 bg-orange-50/30" : "bg-card"}`}
            >
              <div className="text-xs font-bold text-orange-600">
                For Direct Disposal
              </div>
              <p className="text-[10px] text-muted-foreground">
                Skips warehouse loops. Routes to Accounting directly.
              </p>
            </div>
            <div
              onClick={() =>
                setFormData((p) => ({
                  ...p,
                  workflow_type: "Return to Warehouse",
                }))
              }
              className={`p-3 rounded-lg border cursor-pointer text-center space-y-1 ${formData.workflow_type === "Return to Warehouse" ? "border-blue-500 bg-blue-50/40" : "bg-card"}`}
            >
              <div className="text-xs font-bold text-blue-600">
                Return to Stock
              </div>
              <p className="text-[10px] text-muted-foreground">
                Routes to Logistics counting validation layout first.
              </p>
            </div>
          </div>
        </div>

        {/* --- SKU PRODUCT VARIANT MANIFEST CONSOLE WITH AUTOCOMPLETE LOOKUP --- */}
        <div className="border rounded-xl p-4 space-y-3 bg-slate-50/50">
          <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
            Dynamic SKU Manifest Ledger Builder
          </h3>

          <div className="space-y-2 relative">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">
              Search Variant Catalog SKU
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search variant name, code, or alias..."
                value={skuSearch}
                className="pl-9 bg-background"
                onChange={(e) => {
                  setSkuSearch(e.target.value);
                  setShowSkuDropdown(true);
                  if (!e.target.value)
                    setCurrentItem((p) => ({
                      ...p,
                      item_code: "",
                      item_description: "",
                    }));
                }}
                onFocus={() => setShowSkuDropdown(true)}
              />
              {isSearchingSkus && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* product_variant relational overlay dropdown panel */}
            {showSkuDropdown && variants.length > 0 && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md p-1">
                {variants.map((v) => (
                  <div
                    key={v.sku}
                    className="p-2 text-xs hover:bg-accent rounded-sm cursor-pointer flex justify-between items-start gap-4"
                    onClick={() => {
                      setCurrentItem((prev) => ({
                        ...prev,
                        item_code: v.sku,
                        item_description: `${v.name} (${v.products?.name || "No Parent Category"})`,
                        uom: v.uom || "PCS",
                      }));
                      setSkuSearch(`${v.name} [${v.sku}]`);
                      setShowSkuDropdown(false);
                    }}
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">
                        {v.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono flex gap-2">
                        <span>SKU: {v.sku}</span>
                        {v.alias && <span>Alias: {v.alias}</span>}
                      </div>
                      {v.products && (
                        <div className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded w-fit">
                          Parent: {v.products.name} •{" "}
                          {v.products.category || "Unassigned"}
                        </div>
                      )}
                    </div>
                    {v.uom && (
                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-slate-500 font-mono shrink-0">
                        {v.uom}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quantity and Target row configurations */}
          {currentItem.item_code && (
            <div className="grid grid-cols-3 gap-2 bg-background p-2 rounded border border-dashed text-xs items-center animate-fadeIn">
              <div className="col-span-2">
                <span className="text-[10px] text-muted-foreground block font-mono">
                  Matched SKU: {currentItem.item_code}
                </span>
                <span className="font-medium truncate block text-slate-800">
                  {currentItem.item_description}
                </span>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground block">
                  Filing Qty ({currentItem.uom})
                </label>
                <Input
                  type="number"
                  min="1"
                  value={currentItem.request_qty}
                  onChange={(e) =>
                    setCurrentItem((p) => ({
                      ...p,
                      request_qty: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  className="h-8 text-center font-bold"
                />
              </div>
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
            Append SKU Row to Manifest
          </Button>

          {/* Current Local Localized Memory Tables */}
          {manifestItems.length > 0 && (
            <div className="border rounded-md bg-background max-h-40 overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="p-2 text-xs">SKU</TableHead>
                    <TableHead className="p-2 text-xs">Description</TableHead>
                    <TableHead className="p-2 text-xs text-center">
                      Volume
                    </TableHead>
                    <TableHead className="p-2 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifestItems.map((item, idx) => (
                    <TableRow key={idx} className="text-xs">
                      <td className="p-2 font-mono font-medium">
                        {item.item_code}
                      </td>
                      <td className="p-2 truncate max-w-[200px] text-muted-foreground">
                        {item.item_description}
                      </td>
                      <td className="p-2 text-center font-bold text-primary">
                        {item.request_qty} {item.uom}
                      </td>
                      <td className="p-2 text-center">
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
                      </td>
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
            onClick={() => navigate("/bad-orders")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{" "}
            File Form Manifest
          </Button>
        </div>
      </form>
    </div>
  );
}
