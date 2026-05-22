"use client";

import React, { useState, useEffect } from "react";
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
  card_code: string;
  card_name: string;
}

interface ProductVariant {
  sku: string;
  variant_name: string;
  alias: string;
  oum: string;
  product_name: string;
  category: string;
}

interface InventoryLineItem {
  item_code: string;
  item_description: string;
  qty: number;
  reorder_level: number;
}

export default function SalesInventoryPage() {
  const mainDbClient = supabaseClients["sales.server.main"];

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
  const [inventoryLines, setInventoryLines] = useState<InventoryLineItem[]>([]);

  // UI Visibility States
  const [isOutletComboOpen, setIsOutletComboOpen] = useState(false);
  const [isItemComboOpen, setIsItemComboOpen] = useState(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState(false);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- EFFECT 1: DEBOUNCED OUTLET (BPMD) SEARCH ---
  useEffect(() => {
    async function fetchOutlets() {
      const query = debouncedOutletSearch.trim();

      // Stop execution if search criteria is too short
      if (query.length < 2) {
        setOutlets([]);
        return;
      }

      setIsSearchingOutlets(true);
      try {
        const { data, error } = await mainDbClient
          .from("bpmd")
          .select("card_code, card_name")
          .or(`card_name.ilike.%${query}%,card_code.ilike.%${query}%`)
          .limit(10);

        if (error) throw error;
        setOutlets(data || []);
      } catch (err) {
        console.error("BPMD Lookup Error:", err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }

    fetchOutlets();
  }, [debouncedOutletSearch, mainDbClient]);

  // --- EFFECT 2: DEBOUNCED PRODUCT/VARIANT SEARCH ---
  useEffect(() => {
    async function fetchItems() {
      const query = debouncedItemSearch.trim();

      // Stop execution if search criteria is too short
      if (query.length < 2) {
        setVariants([]);
        return;
      }

      setIsSearchingItems(true);
      try {
        const { data, error } = await mainDbClient
          .from("product_variants")
          .select(
            `
            sku,
            name,
            alias,
            oum,
            products!inner (
              name,
              category
            )
          `,
          )
          .or(
            `name.ilike.%${query}%,sku.ilike.%${query}%,alias.ilike.%${query}%`,
          )
          .limit(15);

        if (error) throw error;

        const formattedItems: ProductVariant[] = (data || []).map(
          (item: any) => ({
            sku: item.sku,
            variant_name: item.name,
            alias: item.alias,
            oum: item.oum,
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
  }, [debouncedItemSearch, mainDbClient]);

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

    const isDuplicate = inventoryLines.some(
      (line) => line.item_code === selectedVariant.sku,
    );
    if (isDuplicate) {
      toast.error("This SKU is already added to the list below.");
      return;
    }

    const newLine: InventoryLineItem = {
      item_code: selectedVariant.sku,
      item_description: `${selectedVariant.category} | ${selectedVariant.product_name} (${selectedVariant.variant_name})`,
      qty,
      reorder_level: reorderLevel,
    };

    setInventoryLines([...inventoryLines, newLine]);

    // Clear out intermediate states
    setSelectedVariant(null);
    setItemInput("");
    setQty(0);
    setReorderLevel(0);
    toast.success("Item queued to manifest.");
  };

  const handleRemoveLineItem = (sku: string) => {
    setInventoryLines(inventoryLines.filter((line) => line.item_code !== sku));
  };

  // --- SAVE OPERATION TO THE DATABASE ---
  const handleSubmitInventory = async () => {
    if (!outletCode || !outletName) {
      toast.error("An explicit destination outlet is required.");
      return;
    }
    if (inventoryLines.length === 0) {
      toast.error("Cannot commit an empty inventory manifest.");
      return;
    }

    setIsSubmitting(true);
    try {
      const activeCompanyId = localStorage.getItem("active_company_id");

      const dbPayload = inventoryLines.map((line) => ({
        outlet_code: outletCode,
        outlet_name: outletName,
        item_code: line.item_code,
        item_description: line.item_description,
        qty: line.qty,
        reorder_level: line.reorder_level,
        company_id: activeCompanyId,
      }));

      const { error } = await mainDbClient
        .from("tbl_inventory")
        .insert(dbPayload);

      if (error) throw error;

      toast.success("Inventory successfully saved.");
      setInventoryLines([]);
      setOutletCode("");
      setOutletName("");
      setOutletInput("");
    } catch (err: any) {
      toast.error(err.message || "Failed to commit inventory data.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                <Label htmlFor="outlet-search">Search Outlet Name</Label>
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
                              key={partner.card_code}
                              value={partner.card_code}
                              onSelect={() => {
                                setOutletCode(partner.card_code);
                                setOutletName(partner.card_name);
                                setIsOutletComboOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  outletCode === partner.card_code
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col truncate">
                                <span className="font-medium text-sm">
                                  {partner.card_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {partner.card_code}
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
                      disabled={!outletCode}
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
                                  Variant: {v.variant_name} ({v.oum})
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
                  <Label htmlFor="reorder">Reorder Level</Label>
                  <Input
                    id="reorder"
                    type="number"
                    min="0"
                    value={reorderLevel || ""}
                    onChange={(e) =>
                      setReorderLevel(
                        Math.max(0, parseInt(e.target.value, 10) || 0),
                      )
                    }
                    placeholder="0"
                    disabled={!selectedVariant}
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

        {/* LEDGER DISPLAY PANEL */}
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
                    Staged items awaiting database confirmation
                  </CardDescription>
                </div>
                {outletCode && (
                  <div className="text-right flex flex-col items-end">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-tight font-mono">
                      Staging Target
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
                    <TableHead className="font-semibold text-foreground">
                      SKU / Item Hash Code
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      Category Tree & System Description
                    </TableHead>
                    <TableHead className="w-[100px] text-center font-semibold text-foreground">
                      Quantity
                    </TableHead>
                    <TableHead className="w-[120px] text-center font-semibold text-foreground">
                      Reorder Min
                    </TableHead>
                    <TableHead className="w-[60px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-64 text-center text-sm text-muted-foreground"
                      >
                        Your manifest ledger stack is currently empty. Define an
                        outlet context and use the item controls panel sidebar
                        on the left to add items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventoryLines.map((line) => (
                      <TableRow
                        key={line.item_code}
                        className="hover:bg-accent/30"
                      >
                        <TableCell className="font-mono text-xs font-semibold tracking-tight text-foreground">
                          {line.item_code}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-medium">
                          {line.item_description}
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm text-foreground">
                          {line.qty}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold font-mono text-muted-foreground">
                          {line.reorder_level}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLineItem(line.item_code)}
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="p-4 border-t bg-muted/10 flex items-center justify-end gap-3 mt-auto">
                <Button
                  variant="outline"
                  onClick={() => setInventoryLines([])}
                  disabled={inventoryLines.length === 0 || isSubmitting}
                >
                  Clear Manifest Grid
                </Button>
                <Button
                  onClick={handleSubmitInventory}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
                  disabled={
                    inventoryLines.length === 0 || isSubmitting || !outletCode
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                      Committing...
                    </>
                  ) : (
                    "Commit Staged Entries"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
