import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  Mail,
  ArrowLeft,
  Loader2,
  UserMinus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EmployeeDetailView from "./employee"; // Importing the detailed view
import { supabaseClients } from "@/config/db";

// Types
export interface EmployeeData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  tbl_licenses: Array<{
    license_role: "admin" | "sales" | "logistic" | "accounting";
    company_id: string;
    tbl_companies: {
      company_name: string;
    };
  }> | null;
}

export default function AllEmployeesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Grid Controller Query States
  const searchQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Target Focus View State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  // --- Fetch Global Employee Directory Matrix ---
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      // Swapped out generic supabase wrapper for your locked 'sales.server.main' engine
      let query = supabaseClients["sales.server.main"].from("tbl_employees")
        .select(`
          id,
          email,
          first_name,
          last_name,
          created_at,
          tbl_licenses (
            license_role,
            company_id,
            tbl_companies (
              company_name
            )
          )
        `);

      if (searchQuery) {
        query = query.or(
          `email.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`,
        );
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;

      setEmployees((data as unknown as EmployeeData[]) || []);
    } catch (error: any) {
      toast.error(
        error.message ||
          "Failed to load directory profile elements from main server.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // --- Search Synchronization ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchParams((prev) => {
        if (searchInput) prev.set("search", searchInput);
        else prev.delete("search");
        return prev;
      });
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, setSearchParams]);

  // Handle drill-down state navigation
  if (selectedEmployeeId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => setSelectedEmployeeId(null)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Employee Directory
        </Button>
        <EmployeeDetailView
          employeeId={selectedEmployeeId}
          onLicenseChange={fetchEmployees}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header and Filter Control Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search directory by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Displaying {employees.length} total registered profiles
        </div>
      </div>

      {/* Grid Rendering Architecture */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Synchronizing employee workspace catalog...
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 border rounded-md bg-card text-muted-foreground">
          No personnel entries found matching the active filtering context.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((employee) => {
            // Determine active assignment token weight
            const hasLicense =
              employee.tbl_licenses && employee.tbl_licenses.length > 0;
            const primaryLicense = hasLicense
              ? employee.tbl_licenses![0]
              : null;

            return (
              <Card
                key={employee.id}
                className="hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-semibold truncate max-w-[180px]">
                        {employee.first_name || employee.last_name
                          ? `${employee.first_name || ""} ${employee.last_name || ""}`.trim()
                          : "Unconfigured Name"}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 text-xs truncate max-w-[200px]">
                        <Mail className="h-3 w-3 shrink-0" /> {employee.email}
                      </CardDescription>
                    </div>

                    {/* Pending vs Verified Status Configuration Badges */}
                    {hasLicense ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 dark:bg-emerald-950/20 dark:text-emerald-400"
                      >
                        <ShieldCheck className="h-3 w-3" /> Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 animate-pulse dark:bg-amber-950/20 dark:text-amber-400"
                      >
                        <ShieldAlert className="h-3 w-3" /> Pending Approval
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="text-sm pb-4 flex-1">
                  <div className="rounded-md bg-muted/40 p-3 space-y-1.5 text-xs">
                    <div className="text-muted-foreground font-medium">
                      Assigned Sub-Context:
                    </div>
                    {hasLicense && primaryLicense ? (
                      <div>
                        <span className="font-semibold text-foreground capitalize">
                          {primaryLicense.license_role}
                        </span>
                        <span className="text-muted-foreground"> at </span>
                        <span className="font-medium text-foreground">
                          {primaryLicense.tbl_companies?.company_name}
                        </span>
                      </div>
                    ) : (
                      <div className="text-amber-600 font-medium flex items-center gap-1">
                        <UserMinus className="h-3 w-3" /> No network workspace
                        mapped.
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="pt-0 border-t bg-muted/10 px-6 py-3">
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-xs font-semibold"
                    onClick={() => setSelectedEmployeeId(employee.id)}
                  >
                    Manage Employee Profile &rarr;
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
