import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";
import { Building2, Eye, Layers, ArrowRight } from "lucide-react";

// shadcn/ui structural component imports
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuditedBusiness {
  bp_code: string;
  outlet_name: string;
  total_audits_count: number;
}

interface AuditSessionLog {
  id: number;
  created_at: string;
  audit_address: string;
  total_discrepancies: number;
}

export default function AuditRegistryDashboard(): React.JSX.Element {
  const mainDbClient = supabaseClients["sales.server.main"];
  const navigate = useNavigate();

  // Runtime View States
  const [businesses, setBusinesses] = useState<AuditedBusiness[]>([]);
  const [historicalSessions, setHistoricalSessions] = useState<
    AuditSessionLog[]
  >([]);
  const [selectedBusiness, setSelectedBusiness] =
    useState<AuditedBusiness | null>(null);

  const [isLoadingRegistry, setIsLoadingRegistry] = useState<boolean>(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  // --- FETCH ALL DISTINCT BUSINESSES WITH ACTIVE ENTRIES ---
  useEffect(() => {
    async function loadAuditedRegistry() {
      setIsLoadingRegistry(true);
      try {
        // Query groups distinct entities using postgres grouping logic
        const { data, error } = await mainDbClient
          .from("tbl_inventory_audits")
          .select("bp_code, outlet_name");

        if (error) throw error;

        // Perform client-side tally reduction mapping
        const businessMap: Record<string, AuditedBusiness> = {};
        (data || []).forEach((row) => {
          if (businessMap[row.bp_code]) {
            businessMap[row.bp_code].total_audits_count += 1;
          } else {
            businessMap[row.bp_code] = {
              bp_code: row.bp_code,
              outlet_name: row.outlet_name,
              total_audits_count: 1,
            };
          }
        });

        setBusinesses(Object.values(businessMap));
      } catch (err) {
        console.error("Failed to parse registry index:", err);
        toast.error("Could not construct audited profiles index.");
      } finally {
        setIsLoadingRegistry(false);
      }
    }
    loadAuditedRegistry();
  }, [mainDbClient]);

  // --- FETCH SESSIONS ON DEMAND PER SELECTED PROFILE ---
  const handleViewBusinessSessions = async (business: AuditedBusiness) => {
    setSelectedBusiness(business);
    setIsDialogOpen(true);
    setIsLoadingSessions(true);
    try {
      const { data, error } = await mainDbClient
        .from("tbl_inventory_audits")
        .select("id, created_at, audit_address, total_discrepancies")
        .eq("bp_code", business.bp_code)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistoricalSessions((data as AuditSessionLog[]) || []);
    } catch (err) {
      console.error("Session lookup exception:", err);
      toast.error("Failed to query historical log references.");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  return (
    <div className="space-y-6 w-full p-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Layers className="h-6 w-6 text-indigo-600" /> Historical Validation
          Ledger
        </h1>
        <p className="text-sm text-slate-500">
          Review business validation historical profiles and audit logs across
          your global operation grids.
        </p>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-sm font-semibold">
            Audited Client Directory
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">BP Reference Code</TableHead>
                <TableHead className="text-xs">Company/Outlet Name</TableHead>
                <TableHead className="text-center text-xs">
                  Completed Logs
                </TableHead>
                <TableHead className="text-right text-xs w-[120px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingRegistry ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-48 text-center text-xs text-slate-400"
                  >
                    Loading directory schema...
                  </TableCell>
                </TableRow>
              ) : businesses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-48 text-center text-xs text-slate-400 italic"
                  >
                    No historical audit files found in this workspace context.
                  </TableCell>
                </TableRow>
              ) : (
                businesses.map((biz) => (
                  <TableRow key={biz.bp_code} className="text-xs">
                    <TableCell className="font-mono text-slate-500 font-medium">
                      {biz.bp_code}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-800">
                      {biz.outlet_name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className="px-2 py-0.5 rounded text-[11px]"
                      >
                        {biz.total_audits_count} independent logs
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => handleViewBusinessSessions(biz)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Inspect logs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MODAL DRILL DOWN PANEL */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600" />{" "}
              {selectedBusiness?.outlet_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an isolated audit instance below to view individual
              tracking logs, map matrices, and line variances.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 max-h-[350px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-xs">Execution Date</TableHead>
                  <TableHead className="text-xs">
                    Location Vector Address
                  </TableHead>
                  <TableHead className="text-center text-xs">
                    Variances
                  </TableHead>
                  <TableHead className="text-right text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingSessions ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center text-xs text-slate-400"
                    >
                      Extracting entry points...
                    </TableCell>
                  </TableRow>
                ) : historicalSessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center text-xs text-slate-400 italic"
                    >
                      No historical traces resolved.
                    </TableCell>
                  </TableRow>
                ) : (
                  historicalSessions.map((session) => (
                    <TableRow key={session.id} className="text-xs">
                      <TableCell className="whitespace-nowrap font-medium text-slate-700">
                        {new Date(session.created_at).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-slate-500"
                        title={session.audit_address}
                      >
                        {session.audit_address}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 font-bold rounded text-[10px]",
                            session.total_discrepancies > 0
                              ? "bg-rose-50 text-rose-600 border border-rose-100"
                              : "bg-emerald-50 text-emerald-600 border border-emerald-100",
                          )}
                        >
                          {session.total_discrepancies} items
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          size="sm"
                          className="h-7 bg-indigo-600 text-white text-[11px] gap-1 hover:bg-indigo-700"
                          onClick={() => {
                            setIsDialogOpen(false);
                            navigate(
                              `/integrated-inventory-sales-system/d/audit/registry/view/${session.id}`,
                            );
                          }}
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
