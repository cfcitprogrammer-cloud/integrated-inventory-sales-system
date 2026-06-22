import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/config/db";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  FileText,
  Package,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  User,
} from "lucide-react";
import RecordDetailsPage from "./record-details";

const ITEMS_PER_PAGE = 10;

export default function DBRegistryPage() {
  const [activeTab, setActiveTab] = useState<"inventory" | "stt" | "bo">(
    "inventory",
  );
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Router management state
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  // Memoized Data Layer handling Joins, Sorting, and Server-Side Pagination Counts
  const db = useMemo(() => {
    const client = supabase();
    const rangeStart = (currentPage - 1) * ITEMS_PER_PAGE;
    const rangeEnd = rangeStart + ITEMS_PER_PAGE - 1;

    return {
      inventory: async () => {
        const { data, error, count } = await client
          .from("tbl_inventory")
          .select(
            `
            *, 
            items:tbl_inventory_items(*),
            user:tbl_employees(first_name, last_name, email)
          `,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(rangeStart, rangeEnd);

        if (error) throw error;
        return { data, count: count || 0 };
      },
      stt: async () => {
        const { data, error, count } = await client
          .from("tbl_stt")
          .select(
            `
            *, 
            items:tbl_stt_items(*),
            user:tbl_employees(first_name, last_name, email)
          `,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(rangeStart, rangeEnd);

        if (error) throw error;
        return { data, count: count || 0 };
      },
      bo: async () => {
        const { data, error, count } = await client
          .from("tbl_bo_input")
          .select(
            `
            *,
            items:tbl_bo_input_items(*),
            attachments:tbl_bo_attachments(*),
            workflow:tbl_bo_workflow(*),
            user:tbl_employees(first_name, last_name, email)
          `,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(rangeStart, rangeEnd);

        if (error) throw error;
        return { data, count: count || 0 };
      },
    };
  }, [currentPage]);

  // Reset page layout cursor context whenever shifting base modules tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await db[activeTab]();
        setData(result.data || []);
        setTotalCount(result.count);
      } catch (err: any) {
        setError(err.message || "Something went wrong fetching records.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [activeTab, db]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  // Compute column numbers dynamically for appropriate Skeleton matching
  const getColumnCount = () => {
    if (activeTab === "bo") return 8;
    if (activeTab === "stt") return 6;
    return 5; // inventory
  };

  if (selectedRecordId !== null) {
    const currentRecord = data.find((r) => r.id === selectedRecordId);
    return (
      <RecordDetailsPage
        record={currentRecord}
        domain={activeTab}
        onBack={() => setSelectedRecordId(null)}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Primary Database
          </h1>
          <p className="text-sm text-muted-foreground">
            Sorted by latest entry logs. Select any row index track to preview
            linked manifests.
          </p>
        </div>
        <Badge
          variant="secondary"
          className="px-3 py-1 font-semibold text-xs tracking-wide uppercase"
        >
          Read-Only View
        </Badge>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as any)}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-3 mb-4">
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="stt" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            STT
          </TabsTrigger>
          <TabsTrigger value="bo" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bad Orders
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>BP Code</TableHead>
              {activeTab === "bo" && (
                <>
                  <TableHead>Distributor Name</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                </>
              )}
              {activeTab === "inventory" && (
                <>
                  <TableHead>Customer Name</TableHead>
                </>
              )}
              {activeTab === "stt" && (
                <>
                  <TableHead>Distributor Name</TableHead>
                  <TableHead>Outlet Name</TableHead>
                </>
              )}
              <TableHead>Logged By</TableHead>
              <TableHead>Logged Time</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[...Array(getColumnCount())].map((_, idx) => (
                    <TableCell key={idx}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={getColumnCount()}
                  className="text-center h-24 text-muted-foreground"
                >
                  No active tracking sequences verified under{" "}
                  {activeTab.toUpperCase()}.
                </TableCell>
              </TableRow>
            ) : (
              data.map((record) => {
                const creatorName = record.user
                  ? `${record.user.first_name || ""} ${record.user.last_name || ""}`.trim() ||
                    record.user.email
                  : "System / Unknown";

                return (
                  <TableRow
                    key={record.id}
                    onClick={() => setSelectedRecordId(record.id)}
                    className="cursor-pointer hover:bg-muted/60 transition-colors group"
                  >
                    {/* Common Header: ID Column */}
                    <TableCell className="font-mono text-xs font-semibold">
                      {record.id}
                    </TableCell>

                    {/* Common Header: BP Code Column */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="font-mono bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                      >
                        {record.bp_code || "N/A"}
                      </Badge>
                    </TableCell>

                    {/* DYNAMIC MIDDLE COLUMNS CORRECTION */}
                    {activeTab === "bo" && (
                      <>
                        <TableCell className="font-medium">
                          {record.outlet_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {record.workflow_type || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {record.status || "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          ₱
                          {record.total_cost?.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          }) || "0.00"}
                        </TableCell>
                      </>
                    )}

                    {activeTab === "inventory" && (
                      <TableCell className="font-medium">
                        {record.outlet_name || "—"}
                      </TableCell>
                    )}

                    {activeTab === "stt" && (
                      <>
                        <TableCell className="font-medium">
                          {record.distributor_name || "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {record.outlet_name || "—"}
                        </TableCell>
                      </>
                    )}

                    {/* Common Header: Logged By Column */}
                    <TableCell className="text-xs font-medium max-w-[140px] truncate">
                      <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{creatorName}</span>
                      </div>
                    </TableCell>

                    {/* Common Header: Logged Time Column */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(record.created_at).toLocaleString()}
                    </TableCell>

                    {/* Action Arrow Column */}
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Dense Pagination Footer Matrix Controls */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-medium text-foreground">{data.length}</span>{" "}
            of <span className="font-medium text-foreground">{totalCount}</span>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || loading}
              className="h-8 gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <div className="text-xs font-medium px-2">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || loading}
              className="h-8 gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
