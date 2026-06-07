// pages/bad-orders/SalesInventoryViewPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Check,
  ChevronsUpDown,
  Package,
  Calendar,
} from "lucide-react";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// --- TYPE INTERFACES ---
interface ProductVariant {
  sku: string;
  variant_name: string;
  alias: string;
  uom: string;
  product_name: string;
  category: string;
}

interface InventoryItem {
  id: number | string;
  inventory_id?: number; // Track which parent sheet this belongs to
  item_code: string;
  item_description: string;
  qty: number;
  uom: string;
  expiration_date?: string;
  isNew?: boolean;
}

interface ParentInventoryData {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
}

export default function SalesInventoryViewPage() {
  const { bp_code } = useParams<{ bp_code: string }>();
  const navigate = useNavigate();

  const mainDbClient = supabaseClients["sales.server.main"];
  const extDbClient = supabaseClients["sales.server.extension"];

  // Component Core States
  const [meta, setMeta] = useState<ParentInventoryData | null>(null);
  const [parentSheets, setParentSheets] = useState<ParentInventoryData[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Auto-Complete Search Input States
  const [itemInput, setItemInput] = useState("");
  const debouncedItemSearch = useDebounce(itemInput, 300);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );

  // UI Flow Controls
  const [isItemComboOpen, setIsItemComboOpen] = useState(false);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [newQty, setNewQty] = useState<number>(0);
  const [expirationDate, setExpirationDate] = useState<string>("");

  // --- EFFECT 1: INITIAL DATA FETCH ---
  useEffect(() => {
    if (bp_code) {
      fetchInventoryDetails();
    }
  }, [bp_code]);

  async function fetchInventoryDetails() {
    try {
      setLoading(true);

      // FIX: Fetch ALL matching inventory records for this customer instead of stopping at limit(1)
      const { data: parents, error: parentError } = await mainDbClient
        .from("tbl_inventory")
        .select("id, created_at, outlet_name, bp_code")
        .eq("bp_code", bp_code)
        .order("created_at", { ascending: false });

      if (parentError) throw parentError;

      if (!parents || parents.length === 0) {
        toast.error(
          "No active worksheet records found for this Business Partner.",
        );
        navigate("/d/sales/my-inventory");
        return;
      }

      // Save primary display metadata (from the latest sheet) and collect all parent IDs
      setMeta(parents[0]);
      setParentSheets(parents);
      const parentIds = parents.map((p) => p.id);

      // FIX: Grab line items belonging to ANY of this customer's sheets
      const { data: itemsData, error: itemsError } = await mainDbClient
        .from("tbl_inventory_items")
        .select(
          "id, inventory_id, item_code, item_description, qty, uom, expiration_date",
        )
        .in("inventory_id", parentIds)
        .order("id", { ascending: true });

      if (itemsError) throw itemsError;
      setItems(itemsData || []);
    } catch (err) {
      console.error("Error retrieving ledger entry values:", err);
      toast.error("Failed to load inventory document details.");
    } finally {
      setLoading(false);
    }
  }

  // --- EFFECT 2: DEBOUNCED PRODUCT LOOKUP ---
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

  const handleQtyFieldChange = (
    itemId: number | string,
    currentExp: string,
    value: number,
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        const itemExp = item.expiration_date || "";
        if (item.id === itemId && itemExp === currentExp) {
          return { ...item, qty: value };
        }
        return item;
      }),
    );
  };

  const handleAddLineItem = () => {
    if (!selectedVariant) {
      toast.error(
        "Please choose an item using the autocomplete search filter.",
      );
      return;
    }
    if (newQty <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }

    const standardizedExpDate = expirationDate || "";

    const isDuplicate = items.some(
      (line) =>
        line.item_code.toLowerCase() === selectedVariant.sku.toLowerCase() &&
        (line.expiration_date || "") === standardizedExpDate,
    );

    if (isDuplicate) {
      toast.error(
        "This SKU with the specified expiration date already exists inside the display sheet.",
      );
      return;
    }

    const uniqueStringId = `temp-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;

    const newLineRow: InventoryItem = {
      id: uniqueStringId,
      // Target the newest parent sheet ID for freshly appended items
      inventory_id: meta?.id,
      item_code: selectedVariant.sku,
      item_description: selectedVariant.product_name,
      uom: selectedVariant.uom || "PCS",
      qty: newQty,
      expiration_date: standardizedExpDate || undefined,
      isNew: true,
    };

    setItems((prev) => [...prev, newLineRow]);
    setSelectedVariant(null);
    setItemInput("");
    setNewQty(0);
    setExpirationDate("");
    toast.success("SKU attached to list view stack.");
  };

  // --- SAVE OPERATION ---
  async function handleUpdateInventory() {
    if (!meta) return;

    try {
      setSaving(true);

      const dbUpdates = items.map((item) => {
        if (item.isNew) {
          return mainDbClient.from("tbl_inventory_items").insert({
            inventory_id: item.inventory_id,
            item_code: item.item_code,
            item_description: item.item_description,
            uom: item.uom,
            qty: Number(item.qty),
            expiration_date: item.expiration_date || null,
          });
        } else {
          return mainDbClient
            .from("tbl_inventory_items")
            .update({ qty: Number(item.qty) })
            .eq("id", item.id);
        }
      });

      const results = await Promise.all(dbUpdates);
      const failedQuery = results.find((res) => res.error);
      if (failedQuery) throw failedQuery.error;

      toast.success("Inventory ledger changes applied successfully.");
      navigate("/d/sales/my-inventory");
    } catch (err) {
      console.error("Batch submission synchronization failed:", err);
      toast.error("Failed to update dynamic inventory tracking items.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-xs font-medium text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        Retrieving inventory worksheet details...
      </div>
    );
  }

  return (
    <section className="space-y-6 max-w-5xl mx-auto p-2">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() =>
              navigate(
                "/integrated-inventory-sales-system/d/sales/my-inventory",
              )
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Review Entry Sheet
            </h1>
            <p className="text-xs text-muted-foreground">
              Adjust stock totals or append catalog variants for this customer
              account row.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          className="text-xs font-medium gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 shadow"
          onClick={handleUpdateInventory}
          disabled={saving || items.length === 0}
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving Changes...
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save Modifications
            </>
          )}
        </Button>
      </div>

      {/* Metadata Card Stack */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border text-xs">
        <div>
          <span className="text-muted-foreground block mb-0.5 font-medium">
            Business Partner Code
          </span>
          <span className="font-mono text-slate-800 font-bold">
            {meta?.bp_code || "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5 font-medium">
            Customer Name
          </span>
          <span className="font-semibold text-slate-900">
            {meta?.outlet_name || "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5 font-medium">
            Active Records Linked
          </span>
          <span className="text-slate-700 font-medium font-bold">
            {parentSheets.length} Worksheets Found
          </span>
        </div>
      </div>

      {/* Items Editable Data Grid */}
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-slate-50/70">
              <TableHead className="w-[150px] font-semibold text-zinc-700">
                SKU Code
              </TableHead>
              <TableHead className="font-semibold text-zinc-700">
                Item Name Description
              </TableHead>
              <TableHead className="w-[100px] font-semibold text-zinc-700">
                UOM
              </TableHead>
              <TableHead className="w-[130px] text-center font-semibold text-zinc-700">
                Expiration
              </TableHead>
              <TableHead className="text-right w-[120px] font-semibold text-zinc-700">
                Quantity
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No tracking lines found nested under this entry sheet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((subItem) => {
                const currentExpValue = subItem.expiration_date || "";
                const compoundRowKey = `${subItem.id}::${subItem.item_code}::${currentExpValue}`;

                return (
                  <TableRow
                    key={compoundRowKey}
                    className="align-middle hover:bg-slate-50/40"
                  >
                    <TableCell className="p-3 font-mono text-slate-500 bg-slate-50/20 select-all">
                      {subItem.item_code}
                    </TableCell>
                    <TableCell className="p-3 font-medium text-slate-700">
                      {subItem.item_description}
                      {subItem.isNew && (
                        <span className="ml-2 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-sans">
                          Staged
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="p-3 font-mono uppercase text-slate-400">
                      {subItem.uom}
                    </TableCell>

                    <TableCell className="p-3 text-center">
                      {subItem.expiration_date ? (
                        <span className="font-mono bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded border text-[11px] inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-neutral-500" />
                          {subItem.expiration_date}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">
                          --
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        className="h-8 text-xs font-bold text-right ml-auto max-w-[100px] bg-white border-slate-200 focus-visible:ring-1"
                        value={subItem.qty ?? 0}
                        onChange={(e) =>
                          handleQtyFieldChange(
                            subItem.id,
                            currentExpValue,
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* AUTOCOMPLETE SKU APPENDING CONTROLS */}
      <div className="bg-slate-50/70 rounded-xl border p-4 space-y-4 shadow-sm">
        <div className="space-y-0.5">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-slate-500" /> Add SKU to
            Inventory Sheet
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Search your extension master catalog to pull and stage item
            definitions into this document.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label
              htmlFor="item-autocomplete-search"
              className="text-[11px] font-semibold text-slate-600"
            >
              Search Catalog Item (By Name, SKU, or Alias)
            </Label>
            <Popover open={isItemComboOpen} onOpenChange={setIsItemComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="item-autocomplete-search"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isItemComboOpen}
                  className="w-full justify-between font-normal text-left truncate h-9 text-xs bg-white border-slate-200"
                >
                  {selectedVariant
                    ? `${selectedVariant.product_name} (${selectedVariant.variant_name})`
                    : "Type to lookup catalog items (min. 2 chars)..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search master variants..."
                    value={itemInput}
                    onValueChange={setItemInput}
                    className="text-xs"
                  />
                  <CommandList>
                    {isSearchingItems && (
                      <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />
                        Scanning remote records...
                      </div>
                    )}
                    {itemInput.trim().length < 2 && !isSearchingItems && (
                      <div className="p-3 text-xs text-center text-muted-foreground">
                        Please type at least 2 characters to trigger search
                        execution.
                      </div>
                    )}
                    {itemInput.trim().length >= 2 &&
                      variants.length === 0 &&
                      !isSearchingItems && (
                        <CommandEmpty className="text-xs p-3 text-center text-muted-foreground">
                          No product models mapped to query.
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
                          className="cursor-pointer text-xs p-2.5 hover:bg-slate-50"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3.5 w-3.5 shrink-0",
                              selectedVariant?.sku === v.sku
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col truncate w-full">
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider font-mono">
                              {v.category}
                            </span>
                            <span className="font-semibold text-slate-900 mt-0.5">
                              {v.product_name}
                            </span>
                            <span className="text-slate-500 text-[11px] mt-0.5">
                              Alias: {v.alias || "N/A"} ({v.uom})
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono mt-1 bg-slate-100 px-1 py-0.5 border rounded self-start">
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

          <div className="flex flex-col gap-1.5 md:col-span-1">
            <Label
              htmlFor="expiration-date"
              className="text-[11px] font-semibold text-slate-600"
            >
              Expiration Date
            </Label>
            <Input
              id="expiration-date"
              type="date"
              className="h-9 text-xs bg-white border-slate-200"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              disabled={!selectedVariant}
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-1">
            <Label
              htmlFor="batch-append-qty"
              className="text-[11px] font-semibold text-slate-600"
            >
              Quantity Count
            </Label>
            <div className="flex gap-2">
              <Input
                id="batch-append-qty"
                type="number"
                min="0"
                className="h-9 text-xs text-right bg-white border-slate-200"
                value={newQty || ""}
                onChange={(e) =>
                  setNewQty(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
                placeholder="0"
                disabled={!selectedVariant}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddLineItem}
                className="h-9 text-xs shrink-0 px-3 bg-zinc-900 text-white hover:bg-zinc-800 font-medium"
                disabled={!selectedVariant}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
