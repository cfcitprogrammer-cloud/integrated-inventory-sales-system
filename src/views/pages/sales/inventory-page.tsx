"use client";

import { useState, useEffect } from "react";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Trash2,
  Building2,
  Package,
  Check,
  ChevronsUpDown,
  Layers,
  ClipboardList,
  CloudCheck,
  Calendar,
} from "lucide-react";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// --- CUSTOM DEBOUNCE HOOK ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// --- TYPE INTERFACES ---
interface BusinessPartner {
  bp_code: string;
  customer_name: string;
}

interface ProductVariant {
  sku: string;
  variant_name: string;
  alias: string;
  uom: string;
  product_name: string;
  category: string;
}

interface InventoryLineItem {
  item_code: string;
  item_description: string;
  item_alias?: string;
  item_uom: string;
  qty: number;
  reorder_level?: number;
  expiration_date?: string;
  isCommitted: boolean;
}

export default function SalesInventoryPage() {
  const mainDbClient = supabaseClients["sales.server.main"];
  const extDbClient = supabaseClients["sales.server.extension"];

  // Selected Target Values
  const [outletCode, setOutletCode] = useState("");
  const [outletName, setOutletName] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );

  // Raw Input States (Captured on keystroke)
  const [outletInput, setOutletInput] = useState("");
  const [itemInput, setItemInput] = useState("");

  // Debounced States (Used for the database query dependency arrays)
  const debouncedOutletSearch = useDebounce(outletInput, 300);
  const debouncedItemSearch = useDebounce(itemInput, 300);

  // Lists returned from Supabase
  const [outlets, setOutlets] = useState<BusinessPartner[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Local Form Input States
  const [qty, setQty] = useState<number>(0);
  const [reorderLevel, setReorderLevel] = useState<number>(0);
  const [expirationDate, setExpirationDate] = useState<string>("");

  // Unified Memory Grid (Holds both committed rows and layout staged entries)
  const [inventoryLines, setInventoryLines] = useState<InventoryLineItem[]>([]);

  // UI Visibility & Async Loaders
  const [isOutletComboOpen, setIsOutletComboOpen] = useState(false);
  const [isItemComboOpen, setIsItemComboOpen] = useState(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState(false);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [isSyncingServerLines, setIsSyncingServerLines] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- EFFECT 1: DEBOUNCED OUTLET (BPMD) SEARCH ---
  useEffect(() => {
    async function fetchOutlets() {
      const query = debouncedOutletSearch.trim();

      if (query.length < 2) {
        setOutlets([]);
        return;
      }

      setIsSearchingOutlets(true);
      try {
        const { data, error } = await extDbClient
          .from("bpmd")
          .select("bp_code, customer_name")
          .or(`customer_name.ilike.%${query}%,bp_code.ilike.%${query}%`)
          .limit(30);

        if (error) throw error;
        setOutlets(data || []);
      } catch (err) {
        console.error("BPMD Lookup Error:", err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }

    fetchOutlets();
  }, [debouncedOutletSearch, extDbClient]);

  // --- EFFECT 2: DEBOUNCED PRODUCT/VARIANT SEARCH ---
  useEffect(() => {
    async function fetchItems() {
      const query = debouncedItemSearch.trim();

      if (query.length < 2) {
        setVariants([]);
        return;
      }

      setIsSearchingItems(true);
      try {
        const { data, error } = await extDbClient
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
          .or(`name.ilike.%${query}%`);

        if (error) throw error;

        const formattedItems: ProductVariant[] = (data || []).map(
          (item: any) => ({
            sku: item.sku,
            variant_name: item.name,
            alias: item.alias,
            uom: item.uom,
            product_name: item.products?.name || "Unknown Product",
            category: item.products?.category || "General",
          }),
        );

        setVariants(formattedItems);
      } catch (err) {
        console.error("Product Variant Lookup Error:", err);
      } finally {
        setIsSearchingItems(false);
      }
    }

    fetchItems();
  }, [debouncedItemSearch, extDbClient]);

  // --- EFFECT 3: FETCH AND SYNC COMMITTED LEDGERS TO UNIFIED TABLE ---
  const fetchAndSyncCommittedItems = async (code: string) => {
    if (!code) {
      setInventoryLines([]);
      return;
    }

    setIsSyncingServerLines(true);
    try {
      // Find headers linked to customer/outlet code
      const { data: headers, error: headerError } = await mainDbClient
        .from("tbl_inventory")
        .select("id")
        .eq("bp_code", code);

      if (headerError) throw headerError;

      if (!headers || headers.length === 0) {
        setInventoryLines([]);
        return;
      }

      const headerIds = headers.map((h) => h.id);

      // Fetch matching historical items
      const { data: dbItems, error: itemsError } = await mainDbClient
        .from("tbl_inventory_items")
        .select(
          "item_code, item_description, qty, uom, reorder_level, expiration_date",
        )
        .in("inventory_id", headerIds);

      if (itemsError) throw itemsError;

      // Map DB entries to shared structure with isCommitted locked to true
      const syncedCommittedLines: InventoryLineItem[] = (dbItems || []).map(
        (db) => ({
          item_code: db.item_code,
          item_description: db.item_description,
          item_uom: db.uom || "",
          qty: db.qty,
          reorder_level: db.reorder_level || 0,
          expiration_date: db.expiration_date || undefined,
          isCommitted: true,
        }),
      );

      setInventoryLines(syncedCommittedLines);
    } catch (err) {
      console.error("Historical Manifest Synchronization Error:", err);
      toast.error(
        "Failed to sync structural balance data with database entries.",
      );
    } finally {
      setIsSyncingServerLines(false);
    }
  };

  useEffect(() => {
    fetchAndSyncCommittedItems(outletCode);
  }, [outletCode]);

  // --- MANIFEST GRID OPERATIONS ---
  const handleAddLineItem = () => {
    if (!selectedVariant) {
      toast.error("Please select a valid item variant.");
      return;
    }
    if (qty <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }

    // Fixed Check: Verify match using combination of SKU AND Expiration Date state parameters
    const isDuplicate = inventoryLines.some(
      (line) =>
        line.item_code === selectedVariant.sku &&
        (line.expiration_date || "") === (expirationDate || ""),
    );

    if (isDuplicate) {
      toast.error(
        "This batch instance (same SKU and Expiration Date) already exists in the manifest compilation ledger.",
      );
      return;
    }

    const newLine: InventoryLineItem = {
      item_code: selectedVariant.sku,
      item_description: `${selectedVariant.product_name} ${selectedVariant.alias}`,
      item_uom: selectedVariant.uom,
      item_alias: selectedVariant.alias,
      qty,
      reorder_level: reorderLevel,
      expiration_date: expirationDate || undefined,
      isCommitted: false,
    };

    setInventoryLines([...inventoryLines, newLine]);

    setSelectedVariant(null);
    setItemInput("");
    setQty(0);
    setReorderLevel(0);
    setExpirationDate("");
    toast.success("Item queued to current workspace manifest.");
  };

  const handleRemoveLineItem = (sku: string, expDate?: string) => {
    const targetLine = inventoryLines.find(
      (line) =>
        line.item_code === sku &&
        (line.expiration_date || "") === (expDate || ""),
    );

    if (targetLine?.isCommitted) {
      toast.error(
        "Committed historical data rows cannot be dropped from client layer.",
      );
      return;
    }

    setInventoryLines(
      inventoryLines.filter(
        (line) =>
          !(
            line.item_code === sku &&
            (line.expiration_date || "") === (expDate || "")
          ),
      ),
    );
  };

  // --- SAVE OPERATION TO THE DATABASE ---
  const handleSubmitInventory = async () => {
    if (!outletCode || !outletName) {
      toast.error("An explicit destination outlet is required.");
      return;
    }

    // Isolate only structural rows that have false statuses
    const uncommittedStagedLines = inventoryLines.filter(
      (line) => !line.isCommitted,
    );

    if (uncommittedStagedLines.length === 0) {
      toast.error(
        "No newly updated workspace items are currently queued for tracking submission.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const activeCompanyId = localStorage.getItem("active_company_id");
      const {
        data: { session },
        error: sessionError,
      } = await mainDbClient.auth.getSession();

      if (sessionError) throw sessionError;

      const userId = session?.user?.id;
      if (!userId) throw new Error("No authenticated user found.");

      // 1. Insert inventory header
      const { data: inventoryData, error: inventoryError } = await mainDbClient
        .from("tbl_inventory")
        .insert({
          bp_code: outletCode,
          outlet_name: outletName,
          company_id: activeCompanyId,
          user_id: userId,
        })
        .select()
        .single();

      if (inventoryError) throw inventoryError;

      const inventoryId = inventoryData.id;

      // 2. Map payload items, allowing null values for entries lacking dates
      const itemPayload = uncommittedStagedLines.map((line) => ({
        inventory_id: inventoryId,
        item_code: line.item_code,
        item_description: line.item_description,
        qty: line.qty,
        uom: line.item_uom,
        reorder_level: line.reorder_level,
        expiration_date: line.expiration_date || null,
      }));

      // 3. Fire structural write query
      const { error: itemsError } = await mainDbClient
        .from("tbl_inventory_items")
        .insert(itemPayload);

      if (itemsError) throw itemsError;

      toast.success(
        "New operational items successfully synced and locked to DB database layer.",
      );

      // Refresh data pool to make sure newly committed elements switch isCommitted to true
      await fetchAndSyncCommittedItems(outletCode);
    } catch (err: any) {
      toast.error(
        err.message || "Failed to commit staging matrix data clusters.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Separate records array values dynamically for cleaner validation feedback metrics
  const totalStagedCount = inventoryLines.filter((l) => !l.isCommitted).length;

  return (
    <div className="space-y-6 w-full p-1 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-indigo-600" /> Sales Inventory
          Entry Console
        </h1>
        <p className="text-sm text-muted-foreground">
          Perform clean, optimized dynamic lookups on your multi-tenant backend
          clusters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* SIDEBAR PARAMETERS COLUMN */}
        <div className="md:col-span-1 space-y-6">
          {/* OUTLET ASSIGNMENT CARD */}
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" /> 1.
                Outlet Destination
              </CardTitle>
              <CardDescription>
                Locate and confirm business partner mapping
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="outlet-search">Search Customer Name</Label>
                <Popover
                  open={isOutletComboOpen}
                  onOpenChange={setIsOutletComboOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="outlet-search"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isOutletComboOpen}
                      className="w-full justify-between font-normal text-left truncate"
                    >
                      {outletName
                        ? outletName
                        : "Type to look up (min. 2 chars)..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search code or company name..."
                        value={outletInput}
                        onValueChange={setOutletInput}
                      />
                      <CommandList>
                        {isSearchingOutlets && (
                          <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />{" "}
                            Running server query...
                          </div>
                        )}
                        {outletInput.trim().length < 2 &&
                          !isSearchingOutlets && (
                            <div className="p-3 text-xs text-center text-muted-foreground">
                              Please type at least 2 characters to trigger
                              search.
                            </div>
                          )}
                        {outletInput.trim().length >= 2 &&
                          outlets.length === 0 &&
                          !isSearchingOutlets && (
                            <CommandEmpty>
                              No matching partners found.
                            </CommandEmpty>
                          )}
                        <CommandGroup>
                          {outlets.map((partner) => (
                            <CommandItem
                              key={partner.bp_code}
                              value={partner.bp_code}
                              onSelect={() => {
                                setOutletCode(partner.bp_code);
                                setOutletName(partner.customer_name);
                                setIsOutletComboOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  outletCode === partner.bp_code
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col truncate">
                                <span className="font-medium text-sm">
                                  {partner.customer_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {partner.bp_code}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-col gap-2">
                <Label>System Outlet Code</Label>
                <Input
                  value={outletCode}
                  placeholder="Auto-populated unique partner code"
                  readOnly
                  className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* CATALOG SELECTION CARD */}
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" /> 2. Catalog
                Entry
              </CardTitle>
              <CardDescription>
                Inject explicitly grouped variant models
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-search">Search Catalog Item</Label>
                <Popover
                  open={isItemComboOpen}
                  onOpenChange={setIsItemComboOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="item-search"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isItemComboOpen}
                      className="w-full justify-between font-normal text-left truncate"
                      disabled={!outletCode || isSyncingServerLines}
                    >
                      {selectedVariant
                        ? `${selectedVariant.product_name} (${selectedVariant.variant_name})`
                        : "Search SKU or category..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search dynamic extensions..."
                        value={itemInput}
                        onValueChange={setItemInput}
                      />
                      <CommandList>
                        {isSearchingItems && (
                          <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />{" "}
                            Scanning inventory nodes...
                          </div>
                        )}
                        {itemInput.trim().length < 2 && !isSearchingItems && (
                          <div className="p-3 text-xs text-center text-muted-foreground">
                            Please type at least 2 characters to trigger search.
                          </div>
                        )}
                        {itemInput.trim().length >= 2 &&
                          variants.length === 0 &&
                          !isSearchingItems && (
                            <CommandEmpty>
                              No matching catalogs resolved.
                            </CommandEmpty>
                          )}
                        <CommandGroup>
                          {variants.map((v) => (
                            <CommandItem
                              key={v.sku}
                              value={v.sku}
                              onSelect={() => {
                                setSelectedVariant(v);
                                setIsItemComboOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedVariant?.sku === v.sku
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col truncate">
                                <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider font-mono">
                                  {v.category}
                                </span>
                                <span className="font-semibold text-sm text-foreground">
                                  {v.product_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Variant: {v.alias} ({v.uom})
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  SKU: {v.sku}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-col gap-2">
                <Label>System Item Code (SKU Hash)</Label>
                <Input
                  value={selectedVariant ? selectedVariant.sku : ""}
                  placeholder="Auto-populated SKU identification line"
                  readOnly
                  className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="qty">Quantity Count</Label>
                  <Input
                    id="qty"
                    type="number"
                    min="0"
                    value={qty || ""}
                    onChange={(e) =>
                      setQty(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                    placeholder="0"
                    disabled={!selectedVariant}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="expiration_date">Expiration Date</Label>
                  <Input
                    id="expiration_date"
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    disabled={!selectedVariant}
                    className="text-xs"
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddLineItem}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5"
                disabled={!selectedVariant}
              >
                <Plus className="h-4 w-4" /> Queue Line Item
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* LEDGER MANIFEST MONITOR */}
        <div className="md:col-span-2 space-y-4">
          <Card className="h-full flex flex-col shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" /> 3.
                    Current Manifest Compilation View
                  </CardTitle>
                  <CardDescription>
                    Reviewing current workspace ledger context mappings.
                  </CardDescription>
                </div>
                {outletCode && (
                  <div className="text-right flex flex-col items-end">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-tight font-mono">
                      Active Customer Context
                    </span>
                    <span className="text-sm font-semibold text-foreground max-w-[200px] truncate">
                      {outletName}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col min-h-[360px]">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground text-xs w-[130px]">
                      SKU / Item Hash Code
                    </TableHead>
                    <TableHead className="font-semibold text-foreground text-xs">
                      System Description & Status Tree
                    </TableHead>
                    <TableHead className="w-[70px] text-center font-semibold text-foreground text-xs">
                      Quantity
                    </TableHead>
                    <TableHead className="w-[110px] text-center font-semibold text-foreground text-xs">
                      Expiration
                    </TableHead>
                    <TableHead className="w-[90px] text-right font-semibold text-foreground text-xs">
                      Action Block
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isSyncingServerLines ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-64 text-center text-sm text-muted-foreground font-medium"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                          Synchronizing with historical remote records...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : inventoryLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-64 text-center text-xs text-muted-foreground italic"
                      >
                        No lines found. Select an outlet context to populate
                        active database stock data, or append new entries using
                        the input engine on the left.
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventoryLines.map((line) => (
                      <TableRow
                        key={`${line.item_code}-${line.expiration_date || "no-exp"}`}
                        className={cn(
                          "transition-colors",
                          line.isCommitted
                            ? "bg-muted/30 border-dashed hover:bg-muted/40"
                            : "hover:bg-accent/40",
                        )}
                      >
                        <TableCell className="font-mono text-xs font-medium text-foreground tracking-tight">
                          {line.item_code}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">
                              {line.item_description}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 bg-background border rounded font-mono text-muted-foreground uppercase">
                                {line.item_uom}
                              </span>
                              {line.isCommitted ? (
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 bg-emerald-50 px-1.5 rounded-sm border border-emerald-200">
                                  <CloudCheck className="h-3 w-3" /> Committed
                                  to Remote Server
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 rounded-sm border border-amber-200">
                                  ● Staged Workspace Line Item
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-center font-bold text-sm",
                            line.isCommitted
                              ? "text-indigo-600/80"
                              : "text-foreground",
                          )}
                        >
                          {line.qty}
                        </TableCell>

                        <TableCell className="text-center text-xs">
                          {line.expiration_date ? (
                            <span className="font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 rounded border text-[11px] inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-neutral-500" />
                              {line.expiration_date}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              --
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right pr-4">
                          {line.isCommitted ? (
                            <span className="text-[10px] font-mono font-bold text-muted-foreground select-none bg-muted px-2 py-1 rounded border border-neutral-300">
                              Locked
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleRemoveLineItem(
                                  line.item_code,
                                  line.expiration_date,
                                )
                              }
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete local staging entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="p-4 border-t bg-muted/10 flex items-center justify-between gap-3 mt-auto">
                <div className="text-xs text-muted-foreground font-mono">
                  {totalStagedCount > 0 && (
                    <span>
                      Ready to Commit:{" "}
                      <strong className="text-amber-600">
                        {totalStagedCount} items
                      </strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setInventoryLines(
                        inventoryLines.filter((l) => l.isCommitted),
                      )
                    }
                    disabled={totalStagedCount === 0 || isSubmitting}
                  >
                    Clear Staged Changes
                  </Button>
                  <Button
                    onClick={handleSubmitInventory}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px]"
                    disabled={totalStagedCount === 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processing
                        Write...
                      </span>
                    ) : (
                      "Commit Manifest Ledger"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
