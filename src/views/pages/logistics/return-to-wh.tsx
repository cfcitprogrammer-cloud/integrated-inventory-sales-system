import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/config/db";
import { Button } from "@/components/ui/button";

// 1. Updated type definition to include the joined employee data structure
type DirectDisposalType = {
  id: number;
  created_at: string;
  outlet_name: string;
  bp_code: string;
  status: string;
  remarks: string;
  // This object captures the relational join properties from your database table layout
  tbl_employees?: {
    first_name: string;
    last_name: string;
    // append any other fields you want from tbl_employees here (e.g. email, department)
  } | null;
};

export default function LogisticsReturnToWHPage() {
  const { id } = useParams<{ id: string }>();

  const [directDisposals, setDirectDisposals] = useState<DirectDisposalType[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Hook to debounce the search input string
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Hook to fetch from Supabase with relational table joins
  useEffect(() => {
    async function fetchDirectDisposals() {
      setIsLoading(true);
      try {
        // 2. Added relational syntax -> tbl_employees(first_name, last_name)
        // Note: Change 'tbl_employees' to match your foreign key relationship name if it uses an alias
        let query = supabase()
          .from("tbl_bo_input")
          .select(
            `
            id,
            created_at,
            outlet_name,
            bp_code,
            status,
            remarks,
            tbl_employees (
              first_name,
              last_name
            )
          `,
          )
          .eq("workflow_type", "Return to Warehouse");

        // Server-side text search using the debounced value
        if (debouncedQuery.trim() !== "") {
          const cleanQuery = debouncedQuery.trim();

          if (!isNaN(Number(cleanQuery))) {
            query = query.eq("id", Number(cleanQuery));
          } else {
            // 3. You can even search using fields on your joined relation table using dot notation:
            query = query.or(
              `outlet_name.ilike.%${cleanQuery}%,bp_code.ilike.%${cleanQuery}%,tbl_employees.first_name.ilike.%${cleanQuery}%,tbl_employees.last_name.ilike.%${cleanQuery}%`,
            );
          }
        }

        const { data, error } = await query.order("created_at", {
          ascending: false,
        });

        if (error) throw error;

        if (data) {
          setDirectDisposals(data as unknown as DirectDisposalType[]);
        }
      } catch (error: any) {
        console.error("Error fetching disposal manifests:", error.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDirectDisposals();
  }, [id, debouncedQuery]);

  return (
    <section className="p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Return to Warehouse Requests
          </h1>
          <p className="text-xs text-muted-foreground">
            View and manage all bad order return to warehouse request documents
            inside current pipelines.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Search by ID, outlet, employee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="rounded-md border bg-white">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Request ID</TableHead>
              <TableHead>Date Filed</TableHead>
              <TableHead>Outlet Name</TableHead>
              <TableHead>Requested By</TableHead>{" "}
              {/* Added column to display employee info */}
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Querying database routing pipelines...
                </TableCell>
              </TableRow>
            ) : directDisposals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No active direct disposal records matching specified
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

                  {/* 4. Display the dynamic relation data properties cleanly */}
                  <TableCell>
                    {disposal.tbl_employees
                      ? `${disposal.tbl_employees.first_name} ${disposal.tbl_employees.last_name}`
                      : "Unassigned Employee"}
                  </TableCell>

                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        disposal.status === "Approved"
                          ? "bg-green-100 text-green-800"
                          : disposal.status === "Rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {disposal.status}
                    </span>
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate italic text-muted-foreground"
                    title={disposal.remarks}
                  >
                    {disposal.remarks || "No entry specified"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/bad-orders/disposal/${disposal.id}`}>
                      <Button size={"xs"} variant={"outline"}>
                        Review
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <td colSpan={6} className="p-4 font-medium">
                Total Pending Requests:
              </td>
              <td className="p-4 text-right font-bold">
                {directDisposals.filter((d) => d.status === "Pending").length}
              </td>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}
