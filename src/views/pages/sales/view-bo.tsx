// pages/bad-orders/ViewBadOrderDetailsPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/config/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default function ViewBadOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDetailedData() {
      if (!id) return;
      setIsLoading(true);
      try {
        const ticketRes = await supabase()
          .from("tbl_bo_input")
          .select("*")
          .eq("id", id)
          .single();
        const itemsRes = await supabase()
          .from("tbl_bo_input_items")
          .select("*")
          .eq("bo_input_id", id);
        const attachRes = await supabase()
          .from("tbl_bo_attachments")
          .select("*")
          .eq("bo_input_id", id);

        setTicket(ticketRes.data);
        setItems(itemsRes.data || []);
        setAttachments(attachRes.data || []);
      } catch (err) {
        console.error("Failed loading manifest values matrix data hooks", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetailedData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Parsing tracking metrics...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Target document metadata missing or deleted context error.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/bad-orders")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Return Document Trace: {ticket.bp_code}
          </h1>
          <p className="text-xs text-muted-foreground">
            Filing verification metadata timeline.
          </p>
        </div>
      </div>

      {/* Trajectory Tracker Mapping */}
      <div className="bg-slate-50 border p-4 rounded-xl">
        <h3 className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-3">
          Workflow Lifecycle Stages Tracker
        </h3>
        {ticket.workflow_type === "For Disposal" ? (
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
            <div className="p-2 border rounded bg-muted text-muted-foreground line-through">
              1. Sales Logged
            </div>
            <div
              className={`p-2 border rounded ${ticket.current_step === "Accounting Verification" ? "bg-orange-50 border-orange-200 text-orange-700 font-bold" : "bg-background"}`}
            >
              2. Accounting Verify
            </div>
            <div
              className={`p-2 border rounded ${ticket.current_step === "AGM Approval" ? "bg-orange-50 border-orange-200 text-orange-700 font-bold" : "bg-background"}`}
            >
              3. AGM Signoff
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
            <div className="p-2 border rounded bg-muted text-muted-foreground line-through">
              1. Sales Logged
            </div>
            <div
              className={`p-2 border rounded ${ticket.current_step === "Logistics Counting" ? "bg-blue-50 border-blue-200 text-blue-700 font-bold" : "bg-background"}`}
            >
              2. Logistics Count
            </div>
            <div
              className={`p-2 border rounded ${ticket.current_step === "Accounting Verification" ? "bg-blue-50 border-blue-200 text-blue-700 font-bold" : "bg-background"}`}
            >
              3. Accounting Valuation
            </div>
            <div
              className={`p-2 border rounded ${ticket.current_step === "AGM Approval" ? "bg-blue-50 border-blue-200 text-blue-700 font-bold" : "bg-background"}`}
            >
              4. AGM Final Clear
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 border-b pb-4 text-sm">
        <div>
          <span className="text-xs text-muted-foreground block">
            Customer Outlet Name:
          </span>
          <span className="font-semibold text-primary">
            {ticket.outlet_name}
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">
            Route Assignment:
          </span>
          <span className="font-medium inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs bg-muted">
            {ticket.workflow_type}
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">
            Workflow Status:
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${ticket.status === "Approved" ? "bg-green-100 text-green-700" : ticket.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
          >
            {ticket.status}
          </span>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
            Verification Attachments ({attachments.length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={
                  supabase()
                    .storage.from("bad-orders-attachments")
                    .getPublicUrl(a.file_path).data.publicUrl
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 text-xs truncate text-slate-600 font-mono"
              >
                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="truncate">Reference File</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
          Itemized Manifest Table
        </h3>
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Requested Volume</TableHead>
                <TableHead className="text-center">
                  Actual Verified Volume
                </TableHead>
                <TableHead>Unit Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <td className="font-mono">{item.item_code}</td>
                  <td className="max-w-[240px] truncate">
                    {item.item_description}
                  </td>
                  <td className="text-center font-medium">
                    {item.request_qty}
                  </td>
                  <td className="text-center italic text-muted-foreground">
                    {item.actual_qty ?? "Awaiting Count"}
                  </td>
                  <td>{item.uom}</td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {ticket.remarks && (
        <div className="bg-slate-50 p-3 rounded-lg border text-xs">
          <span className="font-semibold text-slate-700 block mb-1">
            Remarks & Audit Logs:
          </span>
          <p className="italic text-slate-600">{ticket.remarks}</p>
        </div>
      )}
    </div>
  );
}
