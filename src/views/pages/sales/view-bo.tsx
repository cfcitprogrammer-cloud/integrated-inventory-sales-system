// pages/bad-orders/DirectDisposalApprovalDetailsPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Package,
  ShieldAlert,
  User,
  Hash,
} from "lucide-react";
import { supabase } from "@/config/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import RequestTimeline from "@/components/custom/timeline";

// --- Strong Type Definitions ---
interface EmployeeRelation {
  first_name: string;
  last_name: string;
}

interface BadOrderTicket {
  id: number;
  outlet_name: string;
  bp_code: string;
  status: string;
  remarks?: string;
  tbl_employees?: EmployeeRelation | null;
  [key: string]: any;
}

interface DisposalItem {
  id: number;
  bo_input_id: number;
  item_code: string;
  item_description: string;
  request_qty: number;
  uom: string;
  expiration_date?: string | null; // Added field
  reason?: string | null; // Added field
}

interface Attachment {
  id: number;
  bo_input_id: number;
  file_path: string;
  file_name?: string;
}

export default function ViewBadOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<BadOrderTicket | null>(null);
  const [items, setItems] = useState<DisposalItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchDetailedData() {
      if (!id) return;
      setIsLoading(true);
      try {
        // 1. Fetch main ticket data with employee relation joined
        const { data: ticketData, error: ticketErr } = await supabase()
          .from("tbl_bo_input")
          .select(
            `*, tbl_employees (
              first_name,
              last_name
            )`,
          )
          .eq("id", id)
          .single();

        if (ticketErr) throw ticketErr;

        // 2. Fetch related configuration lists concurrently
        const [itemsRes, attachRes] = await Promise.all([
          supabase()
            .from("tbl_bo_input_items")
            .select("*")
            .eq("bo_input_id", id),
          supabase()
            .from("tbl_bo_attachments")
            .select("*")
            .eq("bo_input_id", id),
        ]);

        if (itemsRes.error) throw itemsRes.error;
        if (attachRes.error) throw attachRes.error;

        // 3. Commit states safely
        setTicket(ticketData as BadOrderTicket);
        setItems(itemsRes.data || []);
        setAttachments(attachRes.data || []);
      } catch (err) {
        console.error("Failed loading bad order manifest metrics:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetailedData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        <span className="text-xs font-medium text-slate-500">
          Parsing disposal authorization parameters...
        </span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-md mx-auto my-12 text-center space-y-4 p-6 border rounded-xl bg-white shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Tracking Matrix Error
          </h2>
          <p className="text-xs text-muted-foreground">
            Target bad order document metadata is missing or has been deleted.
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          className="h-8"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to List
        </Button>
      </div>
    );
  }

  const statusLower = ticket.status?.toLowerCase();

  return (
    <section className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Clean Read-Only Action Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              className="h-7 w-7 p-0"
              onClick={() => navigate(-1)}
              title="Go back"
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Bad Order Record
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Read-only summary of the submitted field disposal documentation and
            audit history.
          </p>
        </div>

        <div className="flex items-center gap-2 pl-9 sm:pl-0 font-mono text-xs">
          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-slate-400" /> ID: #
            {String(ticket.id).padStart(5, "0")}
          </span>
        </div>
      </header>

      {/* Main Structural Information Layout Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left/Middle Content Core */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Grid Info Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 border p-4 bg-white rounded-xl shadow-sm text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Customer Outlet Name
              </span>
              <span className="font-semibold text-slate-900 text-sm">
                {ticket.outlet_name}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                BP Code
              </span>
              <div>
                <span className="font-mono inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 mt-0.5">
                  {ticket.bp_code}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Current Status
              </span>
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border mt-0.5 ${
                    statusLower === "open"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : statusLower === "closed"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {ticket.status}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Filer Identity
              </span>
              <span className="font-medium text-slate-700 flex items-center gap-1 mt-0.5">
                <User className="h-3 w-3 text-slate-400" />
                {ticket.tbl_employees
                  ? `${ticket.tbl_employees.first_name} ${ticket.tbl_employees.last_name}`
                  : "System-Generated"}
              </span>
            </div>
          </div>

          {/* SKU / Disposal Items Manifest */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold tracking-wide text-slate-700 uppercase flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-slate-400" />
              Disposal Item Manifest
            </h3>
            <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-slate-50/70">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">
                      SKU Item Code
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Description
                    </TableHead>
                    <TableHead className="text-center w-[100px] font-semibold text-slate-700">
                      Disposal Qty
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 w-[90px]">
                      Unit Type
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 w-[120px]">
                      Expiration
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Reason / Defect
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-muted-foreground font-medium"
                      >
                        No items found listed in this disposal request.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="hover:bg-slate-50/50 transition-colors align-middle"
                      >
                        <TableCell className="font-mono font-medium text-slate-600">
                          {item.item_code}
                        </TableCell>
                        <TableCell
                          className="max-w-[180px] font-medium text-slate-900 truncate"
                          title={item.item_description}
                        >
                          {item.item_description}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-800">
                          {item.request_qty}
                        </TableCell>
                        <TableCell className="font-medium text-slate-500 uppercase font-mono text-[11px]">
                          {item.uom}
                        </TableCell>
                        <TableCell className="font-mono text-slate-600 whitespace-nowrap">
                          {item.expiration_date ? item.expiration_date : "—"}
                        </TableCell>
                        <TableCell
                          className="text-slate-700 font-medium max-w-[150px] truncate"
                          title={item.reason || ""}
                        >
                          {item.reason ? (
                            <span className="bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded text-[11px]">
                              {item.reason}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">
                              Unspecified
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Secure Evidence Attachments Manifest */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold tracking-wide text-slate-700 uppercase">
                Field Evidence Attachments ({attachments.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                    className="flex items-center gap-2.5 p-2.5 border rounded-lg bg-white hover:bg-slate-50 text-xs truncate text-slate-600 font-mono transition-colors shadow-xs"
                  >
                    <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="truncate hover:underline text-slate-700 font-medium">
                      {a.file_name ||
                        a.file_path.split("/").pop() ||
                        "Disposal_Evidence_File"}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Remarks Section */}
          {ticket.remarks && (
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 text-xs shadow-xs space-y-1">
              <span className="font-semibold text-slate-400 block text-[11px] uppercase tracking-wider">
                Filer Remarks:
              </span>
              <p className="italic text-slate-600 font-medium leading-relaxed">
                "{ticket.remarks}"
              </p>
            </div>
          )}
        </div>

        {/* Real-Time Right Sidebar Timeline Segment */}
        <div className="w-full">
          <RequestTimeline
            key={`direct-disposal-timeline-${ticket.id}-${ticket.status}`}
            badOrderId={ticket.id}
          />
        </div>
      </div>
    </section>
  );
}
