import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, Eye, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { supabaseClients } from "@/config/db";

type TblSTTItemDetails = {
  id: number;
  item_code?: string;
  item_description?: string;
  qty?: number;
  uom?: string;
};

type TblSTT = {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  sku_count: number;
  items: TblSTTItemDetails[];
};

type SupabaseSTTItem = {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  tbl_stt_items: TblSTTItemDetails[] | null;
};

export default function SalesAllSTTPage() {
  // 💡 URL-Driven Routing Architecture
  const { page } = useParams<{ page: string }>();
  const navigate = useNavigate();

  // Safeguard: Fallback to page 1 if URL param is missing or corrupted
  const urlPage = page && !isNaN(Number(page)) ? Number(page) : 1;

  const [STT, setSTT] = useState<TblSTT[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const itemsPerPage = 10;

  // View SKU Modal state
  const [isSkuModalOpen, setIsSkuModalOpen] = useState(false);
  const [selectedSTT, setSelectedSTT] = useState<TblSTT | null>(null);

  const currentCompanyId = localStorage.getItem("active_workspace_company_id");
  const mainDbClient = supabaseClients["sales.server.main"];

  useEffect(() => {
    fetchSTT();
  }, []);

  async function fetchSTT() {
    try {
      setLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await mainDbClient.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = session?.user?.id;
      if (!userId) {
        console.error("No active session found.");
        return;
      }

      const { data, error } = await mainDbClient
        .from("tbl_stt")
        .select(
          `
          id,
          created_at,
          outlet_name,
          bp_code,
          tbl_stt_items (
            id,
            item_code,
            item_description,
            qty,
            uom
          )
        `,
        )
        .eq("company_id", currentCompanyId)
        .eq("user_id", userId) // 👈 Already enforced securely via local session context!
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rawData = data as unknown as SupabaseSTTItem[];

      const formattedData =
        rawData?.map((item) => {
          const itemsList = Array.isArray(item.tbl_stt_items)
            ? item.tbl_stt_items
            : [];

          return {
            id: item.id,
            created_at: new Date(item.created_at).toLocaleDateString(),
            outlet_name: item.outlet_name,
            bp_code: item.bp_code,
            sku_count: itemsList.length,
            items: itemsList,
          };
        }) || [];

      setSTT(formattedData);
    } catch (err) {
      console.error("Fetch STT error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Pure Pagination Engine routing coordinator
  const handlePageChange = (newPage: number) => {
    navigate(`/integrated-inventory-sales-system/d/sales/stt/${newPage}`);
  };

  // --- Search & Pagination Computations ---
  const filteredSTT = STT.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.outlet_name.toLowerCase().includes(query) ||
      item.bp_code.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(filteredSTT.length / itemsPerPage) || 1;
  const indexOfFirstItem = (urlPage - 1) * itemsPerPage;
  const currentItems = filteredSTT.slice(
    indexOfFirstItem,
    indexOfFirstItem + itemsPerPage,
  );

  return (
    <section className="p-6 space-y-6">
      {/* Responsive Header Block */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            My Sales to Trade
          </h1>
          <p className="text-xs text-muted-foreground">
            View, track, and manage submitted sales to trade documents.
          </p>
        </div>

        <div className="w-full lg:w-72 relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by outlet or BP code..."
            className="pl-9 text-xs"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // 💡 Explicit Interaction: Hard reset routing pipeline to page 1 upon manual keystroke
              if (urlPage !== 1) {
                handlePageChange(1);
              }
            }}
          />
        </div>
      </header>

      {/* Action Subheader Control Segment */}
      <div className="flex items-center gap-2 border-b pb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-zinc-950 text-white shadow-sm">
          All Transfers
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
            {filteredSTT.length}
          </span>
        </div>

        <Link to={"/d/sales/add-STT"} className="ml-auto">
          <Button size="sm" className="h-8 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add STT Record
          </Button>
        </Link>
      </div>

      {/* Consolidated Main Table Container Card */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Request ID</TableHead>
              <TableHead>Date Filed</TableHead>
              <TableHead>Account Details</TableHead>
              <TableHead className="w-[140px] text-center">Volume</TableHead>
              <TableHead className="w-[120px] text-center">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Querying database routing pipelines...
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No active transfer records matching specified parameters.
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((sttItem) => (
                <TableRow key={sttItem.id}>
                  <TableCell className="font-medium text-zinc-900">
                    #{sttItem.id}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-medium">
                    {sttItem.created_at}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-900">
                      {sttItem.outlet_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground tracking-wide font-mono mt-0.5">
                      {sttItem.bp_code}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                      <FileSpreadsheet className="h-3 w-3 text-zinc-500" />
                      {sttItem.sku_count}{" "}
                      {sttItem.sku_count === 1 ? "Item" : "Items"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size={"xs"}
                      variant={"outline"}
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelectedSTT(sttItem);
                        setIsSkuModalOpen(true);
                      }}
                    >
                      <Eye className="h-3 w-3 mr-1" /> Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* 💡 Cohesive Embedded Footer Navigation Panel */}
        {!loading && filteredSTT.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50/70 text-xs text-muted-foreground rounded-b-md">
            <div>
              Showing {indexOfFirstItem + 1} to{" "}
              {Math.min(indexOfFirstItem + itemsPerPage, filteredSTT.length)} of{" "}
              {filteredSTT.length} records
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => handlePageChange(Math.max(urlPage - 1, 1))}
                disabled={urlPage === 1}
              >
                Previous
              </Button>
              <span className="font-medium text-zinc-700 px-1">
                Page {urlPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  handlePageChange(Math.min(urlPage + 1, totalPages))
                }
                disabled={urlPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Itemized SKUs Modal Overlay */}
      <Dialog open={isSkuModalOpen} onOpenChange={setIsSkuModalOpen}>
        <DialogContent className="sm:max-w-xl gap-4 p-6 bg-white rounded-lg shadow-lg border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">
              STT Transaction Content
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Detailed tracking breakdown for{" "}
              <span className="font-medium text-zinc-900">
                {selectedSTT?.outlet_name}
              </span>{" "}
              ({selectedSTT?.bp_code})
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border shadow-sm">
            <Table className="text-xs">
              <TableHeader className="bg-zinc-50/70 sticky top-0 border-b backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="w-[110px]">SKU Code</TableHead>
                  <TableHead>Item Description</TableHead>
                  <TableHead className="w-[70px] text-center">UOM</TableHead>
                  <TableHead className="w-[80px] text-right">
                    Quantity
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSTT || selectedSTT.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-20 text-center text-muted-foreground"
                    >
                      No matching items discovered inside this ledger transfer.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedSTT.items.map((subItem) => (
                    <TableRow
                      key={subItem.id}
                      className="hover:bg-zinc-50/50 transition-colors"
                    >
                      <TableCell className="font-mono text-[11px] text-zinc-500 font-medium">
                        {subItem.item_code || "—"}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900">
                        {subItem.item_description ||
                          `Unregistered SKU #${subItem.id}`}
                      </TableCell>
                      <TableCell className="text-center text-zinc-600 font-medium">
                        {subItem.uom ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-zinc-900">
                        {subItem.qty?.toLocaleString() ?? "0"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <footer className="flex items-center justify-between pt-2 border-t text-xs">
            <div className="text-muted-foreground font-medium">
              Total Manifest Content:{" "}
              <span className="text-zinc-900 font-semibold">
                {selectedSTT?.sku_count} Distinct Line Items
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs px-4"
              onClick={() => setIsSkuModalOpen(false)}
            >
              Close View
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </section>
  );
}
