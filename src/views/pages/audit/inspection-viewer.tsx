import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import L from "leaflet";
import {
  Loader2,
  Building2,
  Layers,
  ClipboardCheck,
  Save,
  MapPin,
  Map as MapIcon,
  ArrowLeft,
  Lock,
  Unlock,
  Compass,
} from "lucide-react";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Reinitialize fallback global structures
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
});

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
import { Badge } from "@/components/ui/badge";

interface AuditHeader {
  id: number;
  bp_code: string;
  outlet_name: string;
  audit_address: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

interface AuditLineItem {
  id: number;
  item_code: string;
  item_description: string;
  uom: string;
  expected_qty: number;
  physical_qty: number;
  variance_count: number;
  expiration_date?: string;
}

// Inline controller component to programmatically fly map camera to active coordinate vectors
function MapViewSyncController({
  center,
  onMapClick,
  isLocked,
}: {
  center: [number, number];
  onMapClick: (lat: number, lng: number) => void;
  isLocked: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (center && center[0] !== 0 && center[1] !== 0) {
      map.panTo(center);
    }
  }, [center, map]);

  useEffect(() => {
    if (isLocked) return;

    const handleContextClick = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };

    map.on("click", handleContextClick);
    return () => {
      map.off("click", handleContextClick);
    };
  }, [map, onMapClick, isLocked]);

  return null;
}

export default function AuditInspectionViewer(): React.JSX.Element {
  const { auditId } = useParams<{ auditId: string }>();
  const navigate = useNavigate();
  const mainDbClient = supabaseClients["sales.server.main"];

  // Core Structured Memory Vectors
  const [header, setHeader] = useState<AuditHeader | null>(null);
  const [lines, setLines] = useState<AuditLineItem[]>([]);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(true);
  const [isUpdatingRecord, setIsUpdatingRecord] = useState<boolean>(false);
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

  useEffect(() => {
    async function loadFullAuditSessionData() {
      if (!auditId) return;
      setIsLoadingPage(true);
      try {
        const { data: parentHeader, error: headerErr } = await mainDbClient
          .from("tbl_inventory_audits")
          .select(
            "id, bp_code, outlet_name, audit_address, latitude, longitude, created_at",
          )
          .eq("id", auditId)
          .single();

        if (headerErr) throw headerErr;
        const resolvedHeader = parentHeader as AuditHeader;

        // Handle fallback bounds check if coordinates are unpopulated components
        resolvedHeader.latitude = resolvedHeader.latitude || 14.5995;
        resolvedHeader.longitude = resolvedHeader.longitude || 120.9842;

        setHeader(resolvedHeader);

        // --- TIME LOCK ALGORITHM ENGINE ---
        const actualCreationMoment = new Date(
          resolvedHeader.created_at,
        ).getTime();
        const currentExecutionMoment = new Date().getTime();
        const millisecondTimeGap =
          currentExecutionMoment - actualCreationMoment;
        const threeDaysInMilliseconds = 3 * 24 * 60 * 60 * 1000;

        if (millisecondTimeGap >= threeDaysInMilliseconds) {
          setIsLocked(true);
        }

        const { data: childLines, error: linesErr } = await mainDbClient
          .from("tbl_inventory_audit_items")
          .select(
            "id, item_code, item_description, uom, expected_qty, physical_qty, variance_count, expiration_date",
          )
          .eq("audit_id", auditId);

        if (linesErr) throw linesErr;
        setLines((childLines as AuditLineItem[]) || []);
      } catch (err) {
        console.error(
          "Critical error building inspection viewer context:",
          err,
        );
        toast.error(
          "Failed to recover target validation logs profile components.",
        );
      } finally {
        setIsLoadingPage(false);
      }
    }
    loadFullAuditSessionData();
  }, [auditId, mainDbClient]);

  const handleModifyLinePhysicalQuantity = (
    lineId: number,
    updatedValue: number,
  ) => {
    if (isLocked) return;
    setLines((prevLines) =>
      prevLines.map((line) => {
        if (line.id === lineId) {
          return {
            ...line,
            physical_qty: updatedValue,
            variance_count: updatedValue - line.expected_qty,
          };
        }
        return line;
      }),
    );
  };

  const handleModifyAddressString = (updatedAddress: string) => {
    if (isLocked || !header) return;
    setHeader({ ...header, audit_address: updatedAddress });
  };

  const handleUpdateCoordinates = (lat: number, lng: number) => {
    if (isLocked || !header) return;
    setHeader({ ...header, latitude: lat, longitude: lng });
  };

  // Automated Asynchronous Geocoding Engine tracking via OpenStreetMap Nominatim API
  const handleQueryAddressGeocodePayload = async () => {
    if (isLocked || !header || !header.audit_address.trim()) return;
    setIsGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(header.audit_address)}&limit=1`,
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const resolvedLat = parseFloat(data[0].lat);
        const resolvedLng = parseFloat(data[0].lon);
        handleUpdateCoordinates(resolvedLat, resolvedLng);
        toast.success("Geocoding complete. Map anchor relocated.");
      } else {
        toast.error(
          "Could not trace coordinates matching that specific address criteria.",
        );
      }
    } catch (err) {
      console.error("Geocoding runtime failure:", err);
      toast.error("Network interface error verifying address coordinates.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleCommitAlteredAuditLines = async () => {
    if (isLocked || !header) {
      toast.error(
        "This log verification entry is locked and cannot be updated.",
      );
      return;
    }
    setIsUpdatingRecord(true);
    try {
      for (const line of lines) {
        const { error } = await mainDbClient
          .from("tbl_inventory_audit_items")
          .update({
            physical_qty: line.physical_qty,
            variance_count: line.variance_count,
          })
          .eq("id", line.id);
        if (error) throw error;
      }

      const alteredDiscrepanciesTotal = lines.filter(
        (l) => l.variance_count !== 0,
      ).length;

      await mainDbClient
        .from("tbl_inventory_audits")
        .update({
          total_discrepancies: alteredDiscrepanciesTotal,
          audit_address: header.audit_address,
          latitude: header.latitude,
          longitude: header.longitude,
        })
        .eq("id", auditId);

      toast.success("Validation entry records updated successfully.");
    } catch (err) {
      console.error("Processing updates failure:", err);
      toast.error("Failed to commit operational baseline alterations.");
    } finally {
      setIsUpdatingRecord(false);
    }
  };

  if (isLoadingPage) {
    return (
      <div className="h-64 w-full flex flex-col justify-center items-center gap-2 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="text-xs font-medium font-mono">
          Reconstructing entry states...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full p-4 max-w-6xl mx-auto">
      {/* ACTION TOPBAR CONSOLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" /> Session
              Inspection Framework
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Audit Record Identity ID:{" "}
              <span className="font-mono text-indigo-600">#{auditId}</span>
            </p>
          </div>
        </div>

        {/* TIME LOCK SECURITY BADGE CONTAINER */}
        <div className="flex items-center gap-3">
          <Badge
            variant={isLocked ? "destructive" : "secondary"}
            className="h-8 text-xs font-bold px-3 gap-1.5 uppercase tracking-wider"
          >
            {isLocked ? (
              <>
                <Lock className="h-3.5 w-3.5" /> Locked (3+ Days Past)
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-emerald-600" /> Fully
                Editable Mode
              </>
            )}
          </Badge>
          {!isLocked && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-2"
              onClick={handleCommitAlteredAuditLines}
              disabled={isUpdatingRecord}
            >
              {isUpdatingRecord ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Adjustments
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* VIEW INFO PROFILE CARDS */}
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 bg-slate-50/50 border-b">
              <CardTitle className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" /> Context
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <div className="flex flex-col gap-1">
                <Label className="text-slate-400 font-medium">
                  Business Target Name
                </Label>
                <div className="font-bold text-slate-800 bg-slate-50 p-2.5 rounded border">
                  {header?.outlet_name}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-slate-400 font-medium">
                    BP Registry Code
                  </Label>
                  <div className="font-mono font-bold bg-slate-50 p-2 rounded border text-center">
                    {header?.bp_code}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-slate-400 font-medium">
                    Log Date Initialized
                  </Label>
                  <div className="font-bold bg-slate-50 p-2 rounded border text-center whitespace-nowrap">
                    {header && new Date(header.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* EDITABLE ADDRESS BAR INPUT FIELD */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="audit_address_input"
                  className="text-slate-400 font-medium"
                >
                  Resolved Static Address String
                </Label>
                <div className="relative flex items-center gap-1">
                  <div className="relative w-full flex items-center">
                    <MapPin className="h-4 w-4 text-indigo-500 absolute left-3 pointer-events-none shrink-0" />
                    <Input
                      id="audit_address_input"
                      type="text"
                      disabled={isLocked}
                      className={cn(
                        "pl-9 text-xs text-slate-700 bg-slate-50 border focus:bg-white pr-8",
                        isLocked && "cursor-not-allowed text-slate-500",
                      )}
                      value={header?.audit_address || ""}
                      onChange={(e) =>
                        handleModifyAddressString(e.target.value)
                      }
                      onBlur={handleQueryAddressGeocodePayload}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleQueryAddressGeocodePayload()
                      }
                      placeholder="Type a location name or address..."
                    />
                    {isGeocoding && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 absolute right-2.5" />
                    )}
                  </div>
                </div>
              </div>

              {/* LIVE STRUCTURED COORDINATES VISUALIZATION RENDERERS */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-dashed">
                <div className="flex flex-col gap-1">
                  <Label className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
                    <Compass className="h-3 w-3" /> Latitude Vector
                  </Label>
                  <div className="font-mono font-semibold bg-slate-50 p-1.5 rounded border text-center text-[11px] text-slate-600">
                    {header?.latitude ? header.latitude.toFixed(6) : "0.000000"}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
                    <Compass className="h-3 w-3" /> Longitude Vector
                  </Label>
                  <div className="font-mono font-semibold bg-slate-50 p-1.5 rounded border text-center text-[11px] text-slate-600">
                    {header?.longitude
                      ? header.longitude.toFixed(6)
                      : "0.000000"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DYNAMIC LEAFLET ELEMENT BLOCK */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5 text-indigo-600" /> Historical
                Anchor Footprint
              </CardTitle>
            </CardHeader>
            <div className="h-[220px] w-full bg-slate-100 relative z-0">
              {header && (
                <MapContainer
                  center={[header.latitude, header.longitude]}
                  zoom={14}
                  style={{ height: "100%", width: "100%" }}
                  dragging={!isLocked}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker
                    position={[header.latitude, header.longitude]}
                    draggable={!isLocked}
                    eventHandlers={{
                      dragend: (e) => {
                        const marker = e.target;
                        if (marker != null) {
                          const { lat, lng } = marker.getLatLng();
                          handleUpdateCoordinates(lat, lng);
                        }
                      },
                    }}
                  >
                    <Popup>
                      <span className="text-xs font-bold">
                        {header.outlet_name}
                      </span>
                    </Popup>
                  </Marker>
                  <MapViewSyncController
                    center={[header.latitude, header.longitude]}
                    onMapClick={handleUpdateCoordinates}
                    isLocked={isLocked}
                  />
                </MapContainer>
              )}
            </div>
            {isLocked ? (
              <div className="p-2 bg-rose-50 text-[10px] text-rose-500 text-center font-medium flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> Map manipulation locked for
                security compliance records.
              </div>
            ) : (
              <div className="p-2 bg-slate-50 text-[10px] text-slate-500 text-center font-medium flex items-center justify-center gap-1 border-t">
                <Unlock className="h-3 w-3 text-emerald-600" /> Click anywhere
                on map or drag marker pin to drop dynamic pin positions.
              </div>
            )}
          </Card>
        </div>

        {/* LEDGER SHEETS DISCREPANCY DISPLAY GRID */}
        <div className="md:col-span-2">
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" /> Item Snapshot
                Entries
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
                      Expected
                    </TableHead>
                    <TableHead className="text-center text-xs w-[110px]">
                      Physical Audit
                    </TableHead>
                    <TableHead className="text-right text-xs w-[80px]">
                      Variance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const hasVariance = line.variance_count !== 0;
                    return (
                      <TableRow
                        key={line.id}
                        className={cn(
                          "text-xs",
                          hasVariance && "bg-amber-50/20",
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
                        <TableCell className="text-center font-semibold bg-slate-50/30">
                          {line.expected_qty}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            disabled={isLocked}
                            className={cn(
                              "h-8 text-xs font-bold text-center max-w-[80px] mx-auto",
                              isLocked
                                ? "bg-slate-50 text-slate-500 cursor-not-allowed"
                                : "focus:ring-emerald-500",
                            )}
                            value={line.physical_qty}
                            onChange={(e) =>
                              handleModifyLinePhysicalQuantity(
                                line.id,
                                Math.max(0, parseInt(e.target.value, 10) || 0),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded border text-[11px]",
                              line.variance_count === 0 &&
                                "text-emerald-600 bg-emerald-50 border-emerald-100",
                              line.variance_count < 0 &&
                                "text-rose-600 bg-rose-50 border-rose-100",
                              line.variance_count > 0 &&
                                "text-amber-600 bg-amber-50 border-amber-100",
                            )}
                          >
                            {line.variance_count > 0
                              ? `+${line.variance_count}`
                              : line.variance_count}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
