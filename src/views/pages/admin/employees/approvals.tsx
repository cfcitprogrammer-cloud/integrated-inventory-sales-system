import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/config/db";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Check,
  ChevronsUpDown,
} from "lucide-react";

// shadcn/ui components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Types
interface PendingUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at?: string;
}

interface Company {
  id: string;
  company_name: string;
}

type LicenseRole = "admin" | "sales" | "logistic" | "accounting";

export default function PendingApprovalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL States
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = 10;

  // Data States
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  // Search local state input
  const [searchInput, setSearchInput] = useState(searchQuery);

  // --- Modal States ---
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);

  // Form Config States
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<LicenseRole>("sales");
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);

  // --- Fetch Companies ---
  const fetchCompanies = useCallback(async () => {
    try {
      const { data, error } = await supabase()
        .from("tbl_companies")
        .select("id, company_name")
        .eq("is_active", true)
        .order("company_name", { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      toast.error("Failed to load company directory");
    }
  }, []);

  // --- Fetch Users Without Licenses ---
  const fetchPendingUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: licensedData, error: licenseError } = await supabase()
        .from("tbl_licenses")
        .select("user_id");

      if (licenseError) throw licenseError;
      const licensedUserIds = licensedData?.map((l) => l.user_id) || [];

      let query = supabase()
        .from("tbl_employees")
        .select("id, email, first_name, last_name, created_at", {
          count: "exact",
        });

      if (licensedUserIds.length > 0) {
        query = query.not("id", "in", `(${licensedUserIds.join(",")})`);
      }

      if (searchQuery) {
        query = query.or(
          `email.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`,
        );
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setPendingUsers(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch pending approval list");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    fetchPendingUsers();
  }, [fetchPendingUsers]);

  // --- Search Debounce ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchParams((prev) => {
        if (searchInput) prev.set("search", searchInput);
        else prev.delete("search");
        prev.set("page", "1");
        return prev;
      });
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, setSearchParams]);

  // --- Intercept Modal Triggers ---
  const handleOpenApprovalModal = (user: PendingUser) => {
    setSelectedUser(user);
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
    setSelectedRole("sales");
    setIsApprovalModalOpen(true);
  };

  const handleOpenRejectModal = (user: PendingUser) => {
    setSelectedUser(user);
    setIsRejectModalOpen(true);
  };

  // --- DB Executions ---
  const handleConfirmApproval = async () => {
    if (!selectedUser || !selectedCompanyId) {
      toast.error("Please pick a company assignment target first.");
      return;
    }

    setIsProcessingId(selectedUser.id);
    setIsApprovalModalOpen(false);

    try {
      const { error } = await supabase()
        .from("tbl_licenses")
        .insert([
          {
            user_id: selectedUser.id,
            license_role: selectedRole,
            company_id: selectedCompanyId,
          },
        ]);

      if (error) throw error;

      toast.success(
        `${selectedUser.first_name || "User"} successfully assigned!`,
      );
      fetchPendingUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to approve user license");
    } finally {
      setIsProcessingId(null);
      setSelectedUser(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!selectedUser) return;

    setIsProcessingId(selectedUser.id);
    setIsRejectModalOpen(false);

    try {
      const { error } = await supabase()
        .from("tbl_employees")
        .delete()
        .eq("id", selectedUser.id);

      if (error) throw error;

      toast.success(`Registration request for ${selectedUser.email} rejected.`);
      fetchPendingUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject registration request");
    } finally {
      setIsProcessingId(null);
      setSelectedUser(null);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set("page", newPage.toString());
      return prev;
    });
  };

  return (
    <div className="space-y-4 w-full">
      {/* Search Bar Controls */}
      <div className="flex items-center justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pending emails or names..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          {totalCount} Users Awaiting Access
        </div>
      </div>

      {/* Main Table Interface */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Identification</TableHead>
              <TableHead>Requested On</TableHead>
              <TableHead>Status Mapping</TableHead>
              <TableHead className="text-right">Action Processing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Finding pending profiles...
                  </div>
                </TableCell>
              </TableRow>
            ) : pendingUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  Excellent! No users are currently waiting for license
                  configurations.
                </TableCell>
              </TableRow>
            ) : (
              pendingUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {user.first_name || user.last_name
                          ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                          : "New Registry User"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                    >
                      Pending License
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                        disabled={isProcessingId !== null}
                        onClick={() => handleOpenApprovalModal(user)}
                      >
                        {isProcessingId === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        )}
                        Configure & Approve
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenRejectModal(user)}
                        disabled={isProcessingId !== null}
                        className="h-8 text-destructive hover:bg-destructive/10"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="text-sm text-muted-foreground">
          Showing {pendingUsers.length} of {totalCount} requests
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* --- APPROVAL CONFIGURATION DIALOG --- */}
      <Dialog open={isApprovalModalOpen} onOpenChange={setIsApprovalModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Configure Employee License</DialogTitle>
            <DialogDescription>
              Assign a deployment scope and authorization access level tier for{" "}
              <span className="font-semibold text-foreground">
                {selectedUser?.email}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-select">Target Corporate Network</Label>
              <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="company-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isComboboxOpen}
                    className="w-full justify-between font-normal"
                    disabled={companies.length === 0}
                  >
                    {selectedCompanyId
                      ? companies.find((c) => c.id === selectedCompanyId)
                          ?.company_name
                      : "Search & select a company..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[412px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type to search company directory..." />
                    <CommandList>
                      <CommandEmpty>
                        No active company profiles matched.
                      </CommandEmpty>
                      <CommandGroup>
                        {companies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.company_name}
                            onSelect={() => {
                              setSelectedCompanyId(company.id);
                              setIsComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCompanyId === company.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {company.company_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Assigned Functional Role</Label>
              <RadioGroup
                value={selectedRole}
                onValueChange={(val) => setSelectedRole(val as LicenseRole)}
                className="grid grid-cols-2 gap-2"
              >
                {(
                  ["admin", "sales", "logistic", "accounting"] as LicenseRole[]
                ).map((role) => (
                  <label
                    key={role}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-3 bg-popover hover:bg-accent/50 cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:ring-1 [&:has([data-state=checked])]:ring-primary",
                    )}
                  >
                    <span className="text-sm font-medium capitalize">
                      {role}
                    </span>
                    <RadioGroupItem value={role} className="sr-only" />
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApprovalModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApproval}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Approve Access Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- SHADCN REJECTION CONFIRMATION DIALOG --- */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Registration Request?</DialogTitle>
            <DialogDescription>
              Are you absolutely sure you want to reject the application for{" "}
              <span className="font-semibold text-foreground">
                {selectedUser?.email}
              </span>
              ? This will remove their profile record from the system
              completely.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsRejectModalOpen(false)}
            >
              Keep Profile
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
