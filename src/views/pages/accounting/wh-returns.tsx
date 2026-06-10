import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/config/db";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

type DirectDisposalType = {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  status: string;
  tbl_employees?: {
    first_name: string;
    last_name: string;
  } | null;
};

export default function AccountingReturnToWHPage() {
  const { page } = useParams<{ page: string }>();
  const navigate = useNavigate();

  // Safeguard: Fallback to page 1 if URL param is garbage or empty
  const urlPage = page && !isNaN(Number(page)) ? Number(page) : 1;

  const [directDisposals, setDirectDisposals] = useState<DirectDisposalType[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [counts, setCounts] = useState({ all: 0, open: 0, closed: 0 });
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const itemsPerPage = 10;

  const handlePageChange = (newPage: number) => {
    navigate(
      `/integrated-inventory-sales-system/d/accounting/return-wh/${newPage}`,
    );
  };

  // 💡 Pure Debounce Loop: Only sync text tokens. No routing interference allowed here!
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Combined Master Data Sync Engine executing strict Supabase server-side operations
  useEffect(() => {
    async function syncServerSideData() {
      setIsLoading(true);
      try {
        const from = (urlPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;
        const cleanQuery = debouncedQuery.trim();

        // -----------------------------------------
        // PIPELINE 1: Fetch Aggregate Badge Metrics
        // -----------------------------------------
        let badgeQuery = supabase()
          .from("tbl_bo_input")
          .select("status", { head: false })
          .eq("workflow_type", "Return to Warehouse");

        if (cleanQuery !== "") {
          badgeQuery = badgeQuery.or(
            `outlet_name.ilike.%${cleanQuery}%,bp_code.ilike.%${cleanQuery}%`,
          );
        }

        const { data: badgeData } = await badgeQuery;

        if (badgeData) {
          setCounts({
            all: badgeData.length,
            open: badgeData.filter((d) => d.status?.toLowerCase() === "open")
              .length,
            closed: badgeData.filter(
              (d) => d.status?.toLowerCase() === "closed",
            ).length,
          });
        }

        // -----------------------------------------
        // PIPELINE 2: Fetch Exact Paginated Range Segment
        // -----------------------------------------
        let dataQuery = supabase()
          .from("tbl_bo_input")
          .select(
            `
    id,
    created_at,
    outlet_name,
    bp_code,
    status,
    tbl_employees (
      first_name,
      last_name
    ),
    tbl_bo_workflow!inner (
      rwh_logistic_updated_at
    )
  `,
            { count: "exact" },
          )
          .eq("workflow_type", "Return to Warehouse")
          .eq("status", "Open")
          .not("tbl_bo_workflow.rwh_logistic_updated_at", "is", null);

        if (statusFilter !== "All") {
          dataQuery = dataQuery.eq("status", statusFilter);
        }

        if (cleanQuery !== "") {
          dataQuery = dataQuery.or(
            `outlet_name.ilike.%${cleanQuery}%,bp_code.ilike.%${cleanQuery}%`,
          );
        }

        const { data, error, count } = await dataQuery
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;

        setDirectDisposals((data as unknown as DirectDisposalType[]) || []);
        setTotalRecords(count || 0);
      } catch (error: any) {
        console.error(
          "Critical fault syncing server-side tracking elements:",
          error.message,
        );
      } finally {
        setIsLoading(false);
      }
    }

    syncServerSideData();
  }, [urlPage, debouncedQuery, statusFilter]);

  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;
  const indexOfFirstItem = (urlPage - 1) * itemsPerPage;

  return (
    <section className="p-6 space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Return to Warehouse Requests
          </h1>
          <p className="text-xs text-muted-foreground">
            View and manage all bad order return to warehouse request documents.
          </p>
        </div>

        <div className="w-full lg:w-72">
          <Input
            placeholder="Search by outlet or BP code..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // 💡 Explicit Interaction: Reset page ONLY when the human hits a key in the search field
              if (urlPage !== 1) {
                handlePageChange(1);
              }
            }}
          />
        </div>
      </header>

      {/* Pill Badge Filters Section */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 planar-scrolls">
        <button
          disabled={isLoading}
          onClick={() => {
            setStatusFilter("All");
            handlePageChange(1);
          }}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all shadow-sm ${
            statusFilter === "All"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white text-muted-foreground hover:bg-zinc-50 border-input"
          }`}
        >
          All
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              statusFilter === "All"
                ? "bg-white/20 text-white"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {counts.all}
          </span>
        </button>

        <button
          disabled={isLoading}
          onClick={() => {
            setStatusFilter("Open");
            handlePageChange(1);
          }}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all shadow-sm ${
            statusFilter === "Open"
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white text-muted-foreground hover:bg-zinc-50 border-input"
          }`}
        >
          Open
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              statusFilter === "Open"
                ? "bg-white/25 text-white"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {counts.open}
          </span>
        </button>

        <button
          disabled={isLoading}
          onClick={() => {
            setStatusFilter("Closed");
            handlePageChange(1);
          }}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all shadow-sm ${
            statusFilter === "Closed"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-muted-foreground hover:bg-zinc-50 border-input"
          }`}
        >
          Closed
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              statusFilter === "Closed"
                ? "bg-white/25 text-white"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {counts.closed}
          </span>
        </button>
      </div>

      {/* Main Datatable view Container */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Request ID</TableHead>
              <TableHead>Date Filed</TableHead>
              <TableHead>Outlet Name</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Querying database routing pipelines...
                </TableCell>
              </TableRow>
            ) : directDisposals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No active return warehouse records matching specified
                  parameters.
                </TableCell>
              </TableRow>
            ) : (
              directDisposals.map((disposal) => (
                <TableRow key={disposal.id}>
                  <TableCell className="font-medium">#{disposal.id}</TableCell>
                  <TableCell>
                    {disposal.created_at
                      ? new Date(disposal.created_at).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{disposal.outlet_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {disposal.bp_code}
                    </div>
                  </TableCell>

                  <TableCell>
                    {disposal.tbl_employees
                      ? `${disposal.tbl_employees.first_name} ${disposal.tbl_employees.last_name}`
                      : "Unassigned Employee"}
                  </TableCell>

                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        disposal.status.toLowerCase() === "open"
                          ? "bg-green-100 text-green-800"
                          : disposal.status.toLowerCase() === "closed"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {disposal.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link to={`/d/accounting/view/return-wh/${disposal.id}`}>
                      <Button size={"xs"} variant={"outline"}>
                        <Eye className="h-3 w-3 mr-1" /> Review
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pure Server-side Pagination Panel Controls */}
        {!isLoading && totalRecords > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50/70 text-xs text-muted-foreground rounded-b-md">
            <div>
              Showing {indexOfFirstItem + 1} to{" "}
              {Math.min(indexOfFirstItem + itemsPerPage, totalRecords)} of{" "}
              {totalRecords} records
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
    </section>
  );
}
