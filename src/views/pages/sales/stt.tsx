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

interface STTLineItem {
  item_code: string;
  item_description: string;
  item_alias: string;
  item_uom: string;
  qty: number;
  reorder_level: number;
}

export default function SalesSTTPage() {
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
  const [STTLines, setSTTLines] = useState<STTLineItem[]>([]);

  // UI Visibility States
  const [isOutletComboOpen, setIsOutletComboOpen] = useState(false);
  const [isItemComboOpen, setIsItemComboOpen] = useState(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState(false);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fallback storage synchronization from previous code pattern
  const currentCompanyId =
    localStorage.getItem("active_workspace_company_id") ||
    localStorage.getItem("active_company_id");

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

    const isDuplicate = STTLines.some(
      (line) => line.item_code === selectedVariant.sku,
    );
    if (isDuplicate) {
      toast.error("This SKU is already added to the list below.");
      return;
    }

    const newLine: STTLineItem = {
      item_code: selectedVariant.sku,
      item_description: `${selectedVariant.product_name}`,
      item_uom: selectedVariant.uom,
      item_alias: selectedVariant.alias,
      qty,
      reorder_level: reorderLevel,
    };

    setSTTLines([...STTLines, newLine]);

    setSelectedVariant(null);
    setItemInput("");
    setQty(0);
    setReorderLevel(0);
    toast.success("Item added to current cart");
  };

  const handleRemoveLineItem = (sku: string) => {
    setSTTLines(STTLines.filter((line) => line.item_code !== sku));
  };

  // --- SAVE OPERATION TO THE DATABASE ---
  const handleSubmitSTT = async () => {
    if (!outletCode || !outletName) {
      toast.error("An explicit destination outlet is required.");
      return;
    }

    if (STTLines.length === 0) {
      toast.error("Cannot commit an empty STT cart.");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await mainDbClient.auth.getSession();

      if (sessionError) throw sessionError;
      const userId = session?.user?.id;

      if (!userId) {
        throw new Error("No authenticated user found.");
      }

      // 1. Insert STT header
      const { data: STTData, error: STTError } = await mainDbClient
        .from("tbl_stt")
        .insert({
          bp_code: outletCode,
          outlet_name: outletName,
          company_id: currentCompanyId,
          user_id: userId,
        })
        .select()
        .single();

      if (STTError) throw STTError;

      const STTId = STTData.id;

      // 2. Prepare STT items
      const itemPayload = STTLines.map((line) => ({
        stt_id: STTId,
        item_code: line.item_code,
        item_description: line.item_description,
        qty: line.qty,
        uom: line.item_uom,
        reorder_level: line.reorder_level,
      }));

      // 3. Insert items
      const { error: itemsError } = await mainDbClient
        .from("tbl_stt_items")
        .insert(itemPayload);

      if (itemsError) throw itemsError;

      toast.success("STT successfully submitted.");

      setSTTLines([]);
      setOutletCode("");
      setOutletName("");
      setOutletInput("");
    } catch (err: any) {
      toast.error(err.message || "Failed to commit STT data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Dynamic Header Block aligned with code layout 1 */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-zinc-700" /> Sales STT Entry
            Console
          </h1>
          <p className="text-xs text-muted-foreground">
            Place your order pullouts here.
          </p>
        </div>
      </header>

      {/* Control Segment Subheader Panel */}
      <div className="flex items-center gap-2 border-b pb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-zinc-950 text-white shadow-sm">
          Current Cart Items
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
            {STTLines.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* SIDEBAR FORM CONFIGURATION COLUMN */}
        <div className="md:col-span-1 space-y-6">
          {/* OUTLET ASSIGNMENT CARD */}
          <Card className="shadow-sm rounded-md bg-white border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-900">
                <Building2 className="h-4 w-4 text-zinc-500" /> 1. Outlet
                Destination
              </CardTitle>
              <CardDescription className="text-xs">
                Locate and confirm business partner mapping
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="outlet-search"
                  className="text-xs font-medium text-zinc-700"
                >
                  Search Outlet Name
                </Label>
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
                      className="w-full justify-between font-normal text-left truncate h-9 text-xs"
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
                        className="text-xs"
                      />
                      <CommandList>
                        {isSearchingOutlets && (
                          <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600" />{" "}
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
                            <CommandEmpty className="text-xs p-3 text-center text-muted-foreground">
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
                              className="cursor-pointer text-xs p-2"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  outletCode === partner.bp_code
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col truncate">
                                <span className="font-medium text-zinc-900">
                                  {partner.customer_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono tracking-tight mt-0.5">
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
                <Label className="text-xs font-medium text-zinc-700">
                  System Outlet Code
                </Label>
                <Input
                  value={outletCode}
                  placeholder="Auto-populated partner code"
                  readOnly
                  className="bg-zinc-50/70 text-muted-foreground cursor-not-allowed font-mono text-xs h-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* CATALOG SELECTION CARD */}
          <Card className="shadow-sm rounded-md bg-white border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-900">
                <Package className="h-4 w-4 text-zinc-500" /> 2. Item Entry
              </CardTitle>
              <CardDescription className="text-xs">
                Pick and place items to cart
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="item-search"
                  className="text-xs font-medium text-zinc-700"
                >
                  Search Catalog Item
                </Label>
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
                      className="w-full justify-between font-normal text-left truncate h-9 text-xs"
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
                        className="text-xs"
                      />
                      <CommandList>
                        {isSearchingItems && (
                          <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600" />{" "}
                            Scanning STT nodes...
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
                            <CommandEmpty className="text-xs p-3 text-center text-muted-foreground">
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
                              className="cursor-pointer text-xs p-2"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  selectedVariant?.sku === v.sku
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col truncate w-full">
                                <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">
                                  {v.category}
                                </span>
                                <span className="font-medium text-zinc-900 mt-0.5">
                                  {v.product_name}
                                </span>
                                <span className="text-muted-foreground text-[11px] mt-0.5">
                                  Variant: {v.alias} ({v.uom})
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono mt-0.5 bg-zinc-50 px-1 py-0.5 border rounded self-start">
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
                <Label className="text-xs font-medium text-zinc-700">
                  System Item Code (SKU Hash)
                </Label>
                <Input
                  value={selectedVariant ? selectedVariant.sku : ""}
                  placeholder="Auto-populated SKU identification line"
                  readOnly
                  className="bg-zinc-50/70 text-muted-foreground cursor-not-allowed font-mono text-xs h-9"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="qty"
                  className="text-xs font-medium text-zinc-700"
                >
                  Quantity Count
                </Label>
                <Input
                  id="qty"
                  type="number"
                  min="0"
                  value={qty || ""}
                  onChange={(e) =>
                    setQty(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  placeholder="0"
                  className="h-9 text-xs"
                  disabled={!selectedVariant}
                />
              </div>

              <Button
                type="button"
                size="sm"
                onClick={handleAddLineItem}
                className="w-full mt-2 h-9 text-xs bg-zinc-900 text-white hover:bg-zinc-800 gap-1.5 font-medium transition-colors"
                disabled={!selectedVariant}
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* MAIN MANIFEST GRID DISPLAY PANEL */}
        <div className="md:col-span-2">
          <Card className="h-full flex flex-col shadow-sm bg-white border rounded-md overflow-hidden">
            <CardHeader className="pb-3 border-b bg-zinc-50/70">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-900">
                    <Layers className="h-4 w-4 text-zinc-500" /> 3. Current Cart
                    View
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Staged items in the cart awaiting submission
                  </CardDescription>
                </div>
                {outletCode && (
                  <div className="text-right flex flex-col items-end">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                      Staging Target
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 max-w-[180px] truncate mt-0.5">
                      {outletName}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col min-h-[380px]">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-50/40">
                  <TableRow>
                    <TableHead className="font-semibold text-zinc-700 w-[140px]">
                      Item Code
                    </TableHead>
                    <TableHead className="font-semibold text-zinc-700">
                      Item Description
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-semibold text-zinc-700">
                      Quantity
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STTLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-64 text-center text-sm text-muted-foreground bg-white"
                      >
                        Nothing here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    STTLines.map((line) => (
                      <TableRow
                        key={line.item_code}
                        className="hover:bg-zinc-50/50 transition-colors"
                      >
                        <TableCell className="font-mono text-[11px] font-medium tracking-tight text-zinc-500">
                          {line.item_code}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-zinc-900">
                            {line.item_description}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                            {line.item_alias}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold text-zinc-900 text-sm">
                          {line.qty}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLineItem(line.item_code)}
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50/80 rounded-md transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Layout Footer Navigation Controls Panel */}
              <div className="p-3 border-t bg-zinc-50/70 flex items-center justify-end gap-2 mt-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs px-3"
                  onClick={() => setSTTLines([])}
                  disabled={STTLines.length === 0 || isSubmitting}
                >
                  Clear Cart
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitSTT}
                  className="bg-zinc-950 text-white hover:bg-zinc-800 min-w-[150px] h-8 text-xs font-medium transition-colors"
                  disabled={
                    STTLines.length === 0 || isSubmitting || !outletCode
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{" "}
                      Submitting...
                    </>
                  ) : (
                    "Submit Cart"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
