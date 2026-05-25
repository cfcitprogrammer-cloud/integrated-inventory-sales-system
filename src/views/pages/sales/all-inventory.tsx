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
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { supabaseClients } from "@/config/db";

// Defines the individual items inside an inventory entry
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
  outlet_name: string;
  bp_code: string;
  sku_count: number;
  items: TblInventoryItemDetails[]; // Holds the child records
};

// Raw layout typing for Supabase's returns
type SupabaseInventoryItem = {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  tbl_inventory_items: TblInventoryItemDetails[] | null;
};

export default function SalesAllInventoryPage() {
  const navigate = useNavigate();
  const [inventories, setInventories] = useState<TblInventory[]>([]);
  const [loading, setLoading] = useState(false);

  // Search and Pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // View SKU Modal state
  const [isSkuModalOpen, setIsSkuModalOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] =
    useState<TblInventory | null>(null);

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

      // Updated query: Fetch complete fields from tbl_inventory_items
      const { data, error } = await mainDbClient
        .from("tbl_inventory")
        .select(
          `
          id,
          created_at,
          outlet_name,
          bp_code,
          tbl_inventory_items (
            id,
            item_code,
            item_description,
            qty,
            uom
          )
        `,
        )
        .eq("company_id", currentCompanyId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rawData = data as unknown as SupabaseInventoryItem[];

      const formattedData =
        rawData?.map((item) => {
          const itemsList = Array.isArray(item.tbl_inventory_items)
            ? item.tbl_inventory_items
            : [];

          return {
            id: item.id,
            created_at: new Date(item.created_at).toLocaleDateString(),
            outlet_name: item.outlet_name,
            bp_code: item.bp_code,
            sku_count: itemsList.length,
            items: itemsList, // Injected into component state
          };
        }) || [];

      setInventories(formattedData);
    } catch (err) {
      console.error("Fetch inventory error:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- Search & Pagination Logic ---
  const filteredInventories = inventories.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.outlet_name.toLowerCase().includes(query) ||
      item.bp_code.toLowerCase().includes(query)
    );
  });

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
          View and manage submitted inventories.
        </p>
      </header>

      <div className="flex justify-between items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter accounts or bp code..."
            className="pl-9"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>

        <Link to={"/d/sales/add-inventory"}>
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Add Inventory
          </Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Date Filed</TableHead>
              <TableHead>BP Code</TableHead>
              <TableHead>Outlet Name</TableHead>
              <TableHead>SKU's Count</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6">
                  No inventories found.
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((inventory) => (
                <TableRow key={inventory.id}>
                  <TableCell>{inventory.created_at}</TableCell>
                  <TableCell>{inventory.bp_code}</TableCell>
                  <TableCell>{inventory.outlet_name}</TableCell>
                  <TableCell>{inventory.sku_count}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size={"xs"}
                      variant="outline"
                      onClick={() => {
                        setSelectedInventory(inventory);
                        setIsSkuModalOpen(true);
                      }}
                    >
                      <Eye className="mr-1 h-3 w-3" /> View SKU's
                    </Button>
                    <Button
                      size={"xs"}
                      variant="secondary"
                      onClick={() =>
                        navigate(`/d/sales/edit-inventory/${inventory.id}`)
                      }
                    >
                      <Edit2 className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- Pagination Controls --- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2 text-xs">
          <p className="text-muted-foreground">
            Showing {indexOfFirstItem + 1} to{" "}
            {Math.min(indexOfLastItem, filteredInventories.length)} of{" "}
            {filteredInventories.length} entries
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* --- View Itemized SKUs Modal --- */}
      <Dialog open={isSkuModalOpen} onOpenChange={setIsSkuModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Inventory Items</DialogTitle>
            <DialogDescription>
              Detailed breakdown for{" "}
              <strong>{selectedInventory?.outlet_name}</strong> (
              {selectedInventory?.bp_code})
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto my-2 rounded-md border">
            <Table className="text-xs">
              <TableHeader className="bg-muted/50 sticky top-0 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                <TableRow>
                  <TableHead>SKU Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedInventory || selectedInventory.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center py-4 text-muted-foreground"
                    >
                      No matching items found in this transaction.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedInventory.items.map((subItem) => (
                    <TableRow key={subItem.id}>
                      <TableCell className="font-mono">
                        {subItem.item_code || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {subItem.item_description || `Item #${subItem.id}`}
                      </TableCell>
                      <TableCell className="font-medium">
                        {subItem.uom ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {subItem.qty ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center text-xs text-muted-foreground pt-2">
            <span>Total Distinct SKUs: {selectedInventory?.sku_count}</span>
            <Button size="sm" onClick={() => setIsSkuModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
