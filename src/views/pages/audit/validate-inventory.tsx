import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { supabaseClients } from "@/config/db"; // Adjust this import string path to match your configuration setup
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import L from "leaflet";
import {
  Loader2,
  Building2,
  ChevronsUpDown,
  Layers,
  ClipboardCheck,
  Save,
  MapPin,
  Map as MapIcon,
} from "lucide-react";

// --- FIX: ASSET BUNDLER MARKER ICON PATCH ---
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Override fallback global instances directly
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
});

// UI components setup (Swap or adjust structural design dependencies as required)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import MapController from "@/components/custom/map-controller";

// --- TYPES & DATA INTERFACES ---
interface BusinessPartner {
  bp_code: string;
  customer_name: string;
}

interface AuditLineItem {
  item_code: string;
  item_description: string;
  item_uom: string;
  expected_qty: number;
  physical_qty: number;
  variance: number;
  expiration_date?: string;
}

interface GeocodeResponse {
  lat: string;
  lon: string;
  display_name?: string;
}

// Simple Standalone Debounce Processing Hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function InventoryAuditConsole(): React.JSX.Element {
  const mainDbClient = supabaseClients["sales.server.main"];
  const extDbClient = supabaseClients["sales.server.extension"];

  // Core Master Selection States
  const [outletCode, setOutletCode] = useState<string>("");
  const [outletName, setOutletName] = useState<string>("");
  const [outletInput, setOutletInput] = useState<string>("");
  const debouncedOutletSearch = useDebounce<string>(outletInput, 300);
  const [outlets, setOutlets] = useState<BusinessPartner[]>([]);
  const [auditLines, setAuditLines] = useState<AuditLineItem[]>([]);

  // Geospatial Map Vectors (Defaults to center of Manila, PH region)
  const [address, setAddress] = useState<string>("");
  const [latitude, setLatitude] = useState<number>(14.5995);
  const [longitude, setLongitude] = useState<number>(120.9842);
  const debouncedAddressSearch = useDebounce<string>(address, 800);

  // Runtime Tracking Operation Machine Flags
  const [isOutletComboOpen, setIsOutletComboOpen] = useState<boolean>(false);
  const [isSearchingOutlets, setIsSearchingOutlets] = useState<boolean>(false);
  const [isLoadingLedger, setIsLoadingLedger] = useState<boolean>(false);
  const [isSubmittingAudit, setIsSubmittingAudit] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Dynamic CSS Injector for Layout Isolation
  useEffect(() => {
    const linkId = "leaflet-css";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
  }, []);

  // --- HOOK: FORWARD ADDRESS ENGINE (TEXT -> MAP COORDINATES) ---
  useEffect(() => {
    async function geocodeAddress(): Promise<void> {
      if (!debouncedAddressSearch.trim() || debouncedAddressSearch.length < 5)
        return;
      setIsGeocoding(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ph&q=${encodeURIComponent(debouncedAddressSearch)}&limit=1`,
        );
        const data: GeocodeResponse[] = await response.json();
        if (data && data.length > 0) {
          setLatitude(parseFloat(data[0].lat));
          setLongitude(parseFloat(data[0].lon));
          toast.success("Geographic context updated from address input.");
        }
      } catch (err) {
        console.error("Forward geocoding lookup exception:", err);
      } finally {
        setIsGeocoding(false);
      }
    }
    geocodeAddress();
  }, [debouncedAddressSearch]);

  // --- HANDLER: REVERSE GEOLOCATION ENGINE (MANUAL MAP PIN -> TEXT ADDRESS) ---
  const handleMapManualPinPlacement = async (
    lat: number,
    lon: number,
  ): Promise<void> => {
    setLatitude(lat);
    setLongitude(lon);
    setIsGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      );
      const data = await response.json();
      if (data && data.display_name) {
        // Strip excessive resolution down to clean manageable text string
        setAddress(data.display_name);
        toast.info("Audit anchor point shifted via manual pin placement.");
      }
    } catch (err) {
      console.error("Reverse geocoding error:", err);
    } finally {
      setIsGeocoding(false);
    }
  };

  // --- HOOK: DEBOUNCED LOOKUP REGISTRY INTERFACES ---
  useEffect(() => {
    async function fetchOutlets(): Promise<void> {
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
        setOutlets((data as BusinessPartner[]) || []);
      } catch (err) {
        console.error("Context evaluation filtering error:", err);
      } finally {
        setIsSearchingOutlets(false);
      }
    }
    fetchOutlets();
  }, [debouncedOutletSearch, extDbClient]);

  // --- MATRIX: ACCUMULATING HISTORICAL SNAPSHOT RECORDS ---
  const loadInventoryManifestForAudit = async (code: string): Promise<void> => {
    if (!code) {
      setAuditLines([]);
      return;
    }
    setIsLoadingLedger(true);
    try {
      const { data: headers, error: headerError } = await mainDbClient
        .from("tbl_inventory")
        .select("id")
        .eq("bp_code", code);

      if (headerError) throw headerError;
      if (!headers || headers.length === 0) {
        setAuditLines([]);
        toast.info(
          "No active historical footprints matched this registry framework.",
        );
        return;
      }

      const headerIds = headers.map((h) => h.id);
      const { data: dbItems, error: itemsError } = await mainDbClient
        .from("tbl_inventory_items")
        .select("item_code, item_description, qty, uom, expiration_date")
        .in("inventory_id", headerIds);

      if (itemsError) throw itemsError;

      const dynamicRollup: Record<string, AuditLineItem> = {};
      (dbItems || []).forEach((item) => {
        const expKey = item.expiration_date || "no-exp";
        const compositeMapHash = `${item.item_code}::${expKey}`;

        if (dynamicRollup[compositeMapHash]) {
          dynamicRollup[compositeMapHash].expected_qty += item.qty;
          dynamicRollup[compositeMapHash].variance =
            dynamicRollup[compositeMapHash].physical_qty -
            dynamicRollup[compositeMapHash].expected_qty;
        } else {
          dynamicRollup[compositeMapHash] = {
            item_code: item.item_code,
            item_description: item.item_description,
            item_uom: item.uom || "PCS",
            expected_qty: item.qty,
            physical_qty: item.qty,
            variance: 0,
            expiration_date: item.expiration_date || undefined,
          };
        }
      });

      setAuditLines(Object.values(dynamicRollup));
    } catch (err) {
      console.error("Audit Ledger Processing Error:", err);
      toast.error("Failed to compile base reference matrix components.");
    } finally {
      setIsLoadingLedger(false);
    }
  };

  useEffect(() => {
    void loadInventoryManifestForAudit(outletCode);
  }, [outletCode]);

  const handlePhysicalCountChange = (
    sku: string,
    expDate: string,
    countValue: number,
  ): void => {
    setAuditLines((prevLines) =>
      prevLines.map((line) => {
        const matchingExp = line.expiration_date || "no-exp";
        if (line.item_code === sku && matchingExp === expDate) {
          return {
            ...line,
            physical_qty: countValue,
            variance: countValue - line.expected_qty,
          };
        }
        return line;
      }),
    );
  };

  // --- EXECUTE OUTBOUND SAVE TO INDEPENDENT RECONCILIATION DATA REGISTERS ---
  const handleSubmitAuditReport = async (): Promise<void> => {
    if (!outletCode || auditLines.length === 0) {
      toast.error(
        "An operational matrix configuration context must be active to proceed.",
      );
      return;
    }
    if (!address.trim()) {
      toast.error(
        "A confirmed audit execution point address baseline is strictly required.",
      );
      return;
    }

    setIsSubmittingAudit(true);
    try {
      const activeCompanyId = localStorage.getItem("active_company_id");
      const {
        data: { session },
      } = await mainDbClient.auth.getSession();
      const userId = session?.user?.id;
      if (!userId)
        throw new Error(
          "Could not authorize verification credentials signature.",
        );

      // 1. Core independent verification parent write log query
      const { data: auditHeader, error: headerError } = await mainDbClient
        .from("tbl_inventory_audits")
        .insert({
          bp_code: outletCode,
          outlet_name: outletName,
          company_id: activeCompanyId,
          audited_by: userId,
          audit_address: address,
          latitude: latitude,
          longitude: longitude,
          total_discrepancies: auditLines.filter((l) => l.variance !== 0)
            .length,
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // 2. Append lines payload directly mapped to child tracking system keys
      const auditPayload = auditLines.map((line) => ({
        audit_id: auditHeader.id,
        item_code: line.item_code,
        item_description: line.item_description,
        uom: line.item_uom,
        expected_qty: line.expected_qty,
        physical_qty: line.physical_qty,
        variance_count: line.variance,
        expiration_date: line.expiration_date || null,
      }));

      const { error: itemsError } = await mainDbClient
        .from("tbl_inventory_audit_items")
        .insert(auditPayload);

      if (itemsError) throw itemsError;

      toast.success("Independent verification analysis logged successfully.");
      void loadInventoryManifestForAudit(outletCode);
    } catch (err: any) {
      toast.error(err.message || "Failed to commit system variance balances.");
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  return (
    <div className="space-y-6 w-full p-4 max-w-6xl mx-auto">
      {/* HEADER OVERVIEW CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-emerald-600" /> Variance
            Validation Desk
          </h1>
          <p className="text-sm text-slate-500">
            Audit inventory logs directly to separate independent registers with
            pinning validation hooks.
          </p>
        </div>
        {auditLines.length > 0 && (
          <Button
            onClick={() => {
              void handleSubmitAuditReport();
            }}
            disabled={isSubmittingAudit}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
          >
            {isSubmittingAudit ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Log Audit Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* PARAMS INPUT SELECTION FORM */}
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" /> Site Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ACCORDION TRIGGER FOR BP CHOICE */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-600">
                  Active Business Profile
                </Label>
                <Popover
                  open={isOutletComboOpen}
                  onOpenChange={setIsOutletComboOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal text-xs text-left truncate"
                    >
                      {outletName ? outletName : "Filter configuration logs..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type query parameter matching profile..."
                        value={outletInput}
                        onValueChange={setOutletInput}
                      />
                      <CommandList>
                        {isSearchingOutlets && (
                          <div className="p-4 text-center text-xs text-slate-400">
                            Filtering records registry...
                          </div>
                        )}
                        <CommandGroup>
                          {outlets.map((partner) => (
                            <CommandItem
                              key={partner.bp_code}
                              onSelect={() => {
                                setOutletCode(partner.bp_code);
                                setOutletName(partner.customer_name);
                                setIsOutletComboOpen(false);
                              }}
                              className="cursor-pointer text-xs"
                            >
                              {partner.customer_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* DYNAMIC SPATIAL ADDRESS TARGETS */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="audit-address"
                  className="text-xs text-slate-600 flex items-center gap-1"
                >
                  <MapPin className="h-3.5 w-3.5 text-indigo-500" /> Physical
                  Validation Address
                </Label>
                <Input
                  id="audit-address"
                  placeholder="Type address or click directly on the map below..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* READ ONLY LOCATION VECTOR STRINGS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] text-slate-400">
                    Target Latitude
                  </Label>
                  <Input
                    value={isGeocoding ? "Locating..." : latitude.toFixed(5)}
                    readOnly
                    className="bg-slate-50 font-mono text-xs h-8"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] text-slate-400">
                    Target Longitude
                  </Label>
                  <Input
                    value={isGeocoding ? "Locating..." : longitude.toFixed(5)}
                    readOnly
                    className="bg-slate-50 font-mono text-xs h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DYNAMIC MAPPING LEAFLET MATRIX CANVAS */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5 text-emerald-600" /> Interactive
                Spatial Footprint
              </CardTitle>
            </CardHeader>
            <div className="h-[250px] w-full bg-slate-100 relative z-0 cursor-crosshair">
              <MapContainer
                center={[latitude, longitude]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[latitude, longitude]}>
                  <Popup>
                    <div className="text-xs font-medium space-y-1">
                      <p className="font-bold text-slate-800">
                        {outletName || "Audit Station Context"}
                      </p>
                      <p className="text-slate-500 line-clamp-2">
                        {address || "Coordinates resolved."}
                      </p>
                    </div>
                  </Popup>
                </Marker>
                <MapController
                  center={[latitude, longitude]}
                  onMapClick={handleMapManualPinPlacement}
                />
              </MapContainer>
            </div>
            <div className="p-2 border-t bg-slate-50 text-[10px] text-slate-400 text-center">
              💡 Tip: Click anywhere on the map grid to adjust or drop a custom
              pin directly.
            </div>
          </Card>
        </div>

        {/* RECONCILIATION TRACKING DATA MATRICES */}
        <div className="md:col-span-2">
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" /> Active Stock
                Variance Ledger Matrix
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs w-[120px]">
                      SKU Reference
                    </TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      System
                    </TableHead>
                    <TableHead className="text-center text-xs w-[110px]">
                      Physical Count
                    </TableHead>
                    <TableHead className="text-right text-xs w-[80px]">
                      Variance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLedger ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-48 text-center text-xs text-slate-400"
                      >
                        Assembling matrix logs...
                      </TableCell>
                    </TableRow>
                  ) : auditLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-48 text-center text-xs text-slate-400 italic"
                      >
                        No business partner profile scope initialized.
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLines.map((line) => {
                      const expKeyString = line.expiration_date || "no-exp";
                      const hasVariance = line.variance !== 0;
                      return (
                        <TableRow
                          key={`${line.item_code}-${expKeyString}`}
                          className={cn(
                            "text-xs",
                            hasVariance && "bg-amber-50/30",
                          )}
                        >
                          <TableCell className="font-mono text-slate-500">
                            {line.item_code}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700">
                                {line.item_description}
                              </span>
                              {line.expiration_date && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Exp: {line.expiration_date}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-semibold bg-slate-50/50">
                            {line.expected_qty}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                              className="h-8 text-xs font-bold text-center max-w-[80px] mx-auto focus:ring-emerald-500"
                              value={line.physical_qty}
                              onChange={(e) =>
                                handlePhysicalCountChange(
                                  line.item_code,
                                  expKeyString,
                                  Math.max(
                                    0,
                                    parseInt(e.target.value, 10) || 0,
                                  ),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded border text-[11px]",
                                line.variance === 0 &&
                                  "text-emerald-600 bg-emerald-50 border-emerald-100",
                                line.variance < 0 &&
                                  "text-rose-600 bg-rose-50 border-rose-100",
                                line.variance > 0 &&
                                  "text-amber-600 bg-amber-50 border-amber-100",
                              )}
                            >
                              {line.variance > 0
                                ? `+${line.variance}`
                                : line.variance}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
