// pages/bad-orders/BadOrdersListPage.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Plus, Eye, XCircle, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/config/db";

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

export interface BOInput {
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

export default function BadOrdersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(() =>
    localStorage.getItem("active_workspace_company_id"),
  );

  const [tickets, setTickets] = useState<BOInput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<BOInput | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const fetchTickets = useCallback(async () => {
    if (!currentCompanyId) {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * 10;
      const to = from + 9;

      let query = supabase()
        .from("tbl_bo_input")
        .select("*")
        .eq("company_id", currentCompanyId);

      if (searchQuery) {
        query = query.or(
          `outlet_name.ilike.%${searchQuery}%,bp_code.ilike.%${searchQuery}%`,
        );
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setTickets(data || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load workflow ledger");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, currentCompanyId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCancelExecution = async () => {
    if (!cancelTarget) return;
    setIsSubmitting(true);
    try {
      const updatedRemarks =
        `${cancelTarget.remarks || ""} [Canceled by Sales Agent]`.trim();
      const { error } = await supabase()
        .from("tbl_bo_input")
        .update({
          status: "Rejected",
          current_step: "Completed",
          remarks: updatedRemarks,
        })
        .eq("id", cancelTarget.id);

      if (error) throw error;
      toast.success("Workflow successfully terminated");
      setCancelTarget(null);
      fetchTickets();
    } catch (err) {
      toast.error("Failed to transition document state");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-5 p-6">
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bad Orders Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor state transitions across Logistics, Accounting, and the AGM
            desk.
          </p>
        </div>
        <Button
          onClick={() => navigate("/d/sales/add-bo")}
          disabled={!currentCompanyId}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Create Return Manifest
        </Button>
      </div>

      {!currentCompanyId && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <span>
            Select an authorized business workspace entity in the sidebar
            switcher to load records.
          </span>
        </div>
      )}

      <div className="flex justify-between items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search account name or code..."
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
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filing Date</TableHead>
              <TableHead>Customer Account</TableHead>
              <TableHead>Route Type</TableHead>
              <TableHead>Current Step</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />{" "}
                  Reading system status arrays...
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No returns found inside this workspace index.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="text-xs">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {ticket.outlet_name}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {ticket.bp_code}
                    </div>
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
                  <TableCell className="text-xs font-medium text-slate-700">
                    {ticket.current_step}
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
                        onClick={() => navigate(`/d/sales/bo/${ticket.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {ticket.status === "Pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setCancelTarget(ticket)}
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

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Terminate Active Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this return request? This
              permanently drops the ticket out of active approval queues.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelExecution}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
