// pages/bad-orders/SalesAllInventoryPage.tsx
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
import { Plus, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { supabaseClients } from "@/config/db";

type TblInventoryItemDetails = {
  id: number;
  item_code?: string;
  item_description?: string;
  qty?: number;
  uom?: string;
};

type TblInventory = {
  id: number;
  created_at: string;
  display_date: string;
  outlet_name: string;
  bp_code: string;
  sku_count: number;
  items: TblInventoryItemDetails[];
};

export default function SalesAllInventoryPage() {
  const [inventories, setInventories] = useState<TblInventory[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const currentCompanyId = localStorage.getItem("active_workspace_company_id");
  const mainDbClient = supabaseClients["sales.server.main"];

  useEffect(() => {
    fetchInventories();
  }, []);

  async function fetchInventories() {
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

      // Querying our optimized Postgres JSON-aggregated view layout
      const { data, error } = await mainDbClient
        .from("vw_latest_inventory_per_bp")
        .select("id, created_at, outlet_name, bp_code, compiled_items")
        .eq("company_id", currentCompanyId)
        .eq("user_id", userId);

      if (error) throw error;

      const formattedData = (data || []).map((row: any) => {
        let rawItemsList = [];
        if (Array.isArray(row.compiled_items)) {
          rawItemsList = row.compiled_items;
        } else if (typeof row.compiled_items === "string") {
          try {
            rawItemsList = JSON.parse(row.compiled_items);
          } catch {
            rawItemsList = [];
          }
        }

        const cleanItemsList = rawItemsList.filter(
          (item: any) => item && item.item_code,
        );

        // Calculate the distinct SKU count across all combined batch structures
        const distinctSkus = new Set(
          cleanItemsList.map((item: any) =>
            item.item_code.trim().toLowerCase(),
          ),
        );

        return {
          id: row.id,
          created_at: row.created_at,
          display_date: new Date(row.created_at).toLocaleDateString(),
          outlet_name: row.outlet_name || "Unknown Customer",
          bp_code: row.bp_code || "—",
          sku_count: distinctSkus.size,
          items: cleanItemsList,
        };
      });

      // Chronological sort using ISO strings
      formattedData.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setInventories(formattedData);
    } catch (err) {
      console.error("Fetch inventory error:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- Search Filter Logic ---
  const filteredInventories = inventories.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.outlet_name.toLowerCase().includes(query) ||
      item.bp_code.toLowerCase().includes(query)
    );
  });

  // --- Pagination Slice Mechanics ---
  const totalPages = Math.ceil(filteredInventories.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredInventories.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">My Inventory</h1>
        <p className="text-xs text-muted-foreground">
          View and manage submitted inventories natively aggregated by Business
          Partner profiles.
        </p>
      </header>

      <div className="flex justify-between items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter accounts or bp code..."
            className="pl-9 text-xs"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>

        <Link to={"/d/sales/add-inventory"}>
          <Button size="sm" className="text-xs">
            <Plus className="mr-1 h-4 w-4" /> Add Inventory
          </Button>
        </Link>
      </div>

      <div className="rounded-md border bg-white">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Latest Date Filed</TableHead>
              <TableHead>BP Code</TableHead>
              <TableHead>Distributor Name</TableHead>
              <TableHead>SKU's Count</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-6 text-muted-foreground"
                >
                  Loading aggregated worksheets...
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-6 text-muted-foreground"
                >
                  No matching inventory records found.
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((inventory) => (
                <TableRow key={inventory.id}>
                  <TableCell>{inventory.display_date}</TableCell>
                  <TableCell className="font-mono font-bold text-slate-700">
                    {inventory.bp_code}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {inventory.outlet_name}
                  </TableCell>
                  <TableCell className="font-bold text-indigo-600 text-sm">
                    {inventory.sku_count}{" "}
                    {inventory.sku_count === 1 ? "SKU" : "SKUs"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/d/sales/view-inventory/${inventory.bp_code}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2"
                      >
                        <Eye className="h-3 w-3" /> View Sheet
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- Pagination Controls --- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2 text-xs border-t pt-4">
          <p className="text-muted-foreground">
            Showing <strong>{indexOfFirstItem + 1}</strong> to{" "}
            <strong>
              {Math.min(indexOfLastItem, filteredInventories.length)}
            </strong>{" "}
            of <strong>{filteredInventories.length}</strong> entries
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="font-medium bg-slate-50 border px-3 py-1.5 rounded text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
