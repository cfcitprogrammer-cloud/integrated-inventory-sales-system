"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/config/db";
import { toast } from "sonner";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  Edit3,
  Trash2,
  MoreHorizontal,
  Building2,
  Check,
  ChevronsUpDown,
  Plus,
  UserPlus,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
type LicenseRole = "admin" | "sales" | "logistic" | "accounting";

interface Company {
  id: string;
  company_name: string;
}

interface Employee {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface LicenseRecord {
  id: string;
  user_id: string;
  license_role: LicenseRole;
  company_id: string;
  tbl_companies: Company;
  tbl_employees: Employee;
}

export default function LicensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL Query Sync States
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = 10;

  // Data Array States
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  // Search input local state
  const [searchInput, setSearchInput] = useState(searchQuery);

  // --- Modal Visibility States ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<LicenseRecord | null>(
    null,
  );

  // --- Form States for Creating / Provisioning ---
  const [createUserId, setCreateUserId] = useState<string>("");
  const [createCompanyId, setCreateCompanyId] = useState<string>("");
  const [createRole, setCreateRole] = useState<LicenseRole>("sales");
  const [isCreateUserComboOpen, setIsCreateUserComboOpen] = useState(false);
  const [isCreateCompanyComboOpen, setIsCreateCompanyComboOpen] =
    useState(false);

  // --- Form States for Editing ---
  const [editCompanyId, setEditCompanyId] = useState<string>("");
  const [editRole, setEditRole] = useState<LicenseRole>("sales");
  const [isEditComboboxOpen, setIsEditComboboxOpen] = useState(false);

  // --- Fetch Directory Data (Companies & Employees) ---
  const fetchDirectories = useCallback(async () => {
    try {
      const [compRes, empRes] = await Promise.all([
        supabase()
          .from("tbl_companies")
          .select("id, company_name")
          .eq("is_active", true)
          .order("company_name", { ascending: true }),
        supabase()
          .from("tbl_employees")
          .select("id, email, first_name, last_name")
          .order("email", { ascending: true }),
      ]);

      if (compRes.error) throw compRes.error;
      if (empRes.error) throw empRes.error;

      setCompanies(compRes.data || []);
      setEmployees(empRes.data || []);
    } catch (error: any) {
      toast.error("Failed to sync enterprise directory matrices.");
    }
  }, []);

  // --- Fetch Active Licenses Table ---
  const fetchLicenses = useCallback(async () => {
    setIsLoading(true);
    try {
      let offsetFrom = (currentPage - 1) * itemsPerPage;
      let offsetTo = offsetFrom + itemsPerPage - 1;

      let query = supabase()
        .from("tbl_licenses")
        .select(
          `
            id,
            user_id,
            license_role,
            company_id,
            tbl_companies!inner (id, company_name),
            tbl_employees!inner (id, email, first_name, last_name)
          `,
          { count: "exact" },
        );

      if (searchQuery) {
        query = query.or(
          `license_role.ilike.%${searchQuery}%,` +
            `tbl_companies.company_name.ilike.%${searchQuery}%,` +
            `tbl_employees.email.ilike.%${searchQuery}%,` +
            `tbl_employees.first_name.ilike.%${searchQuery}%,` +
            `tbl_employees.last_name.ilike.%${searchQuery}%`,
        );
      }

      const { data, count, error } = await query
        .order("id", { ascending: false }) // Newest assignments first
        .range(offsetFrom, offsetTo);

      if (error) throw error;

      setLicenses((data as unknown as LicenseRecord[]) || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error(error.message || "Failed to load system license parameters");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    f();
  }, []);
  const f = () => {
    fetchDirectories();
  };

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  // Search Debouncer
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

  // --- Modal Actions ---
  const handleOpenEditModal = (license: LicenseRecord) => {
    setSelectedLicense(license);
    setEditCompanyId(license.company_id);
    setEditRole(license.license_role);
    setIsEditModalOpen(true);
  };

  const handleOpenRevokeModal = (license: LicenseRecord) => {
    setSelectedLicense(license);
    setIsRevokeModalOpen(true);
  };

  // --- Database Mutations ---
  const handleCreateLicense = async () => {
    if (!createUserId || !createCompanyId) {
      toast.error("Please select both an employee and a target company.");
      return;
    }
    setIsMutating(true);

    try {
      // Check collision
      const { data: duplicate } = await supabase()
        .from("tbl_licenses")
        .select("id")
        .eq("user_id", createUserId)
        .eq("company_id", createCompanyId)
        .maybeSingle();

      if (duplicate) {
        throw new Error(
          "This employee already holds an assigned license for that workspace.",
        );
      }

      const { error } = await supabase().from("tbl_licenses").insert({
        user_id: createUserId,
        company_id: createCompanyId,
        license_role: createRole,
      });

      if (error) throw error;

      toast.success("New operational workspace scope added to employee.");
      setIsCreateModalOpen(false);
      // Reset form fields
      setCreateUserId("");
      setCreateCompanyId("");
      setCreateRole("sales");
      fetchLicenses();
    } catch (error: any) {
      toast.error(error.message || "Could not assign new license matrix.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateLicense = async () => {
    if (!selectedLicense) return;
    setIsMutating(true);

    try {
      if (editCompanyId !== selectedLicense.company_id) {
        const { data: collisionCheck } = await supabase()
          .from("tbl_licenses")
          .select("id")
          .eq("user_id", selectedLicense.user_id)
          .eq("company_id", editCompanyId)
          .maybeSingle();

        if (collisionCheck) {
          throw new Error(
            "This employee already possesses an active license setup for that target company.",
          );
        }
      }

      // Safely target only this specific license ID row
      const { error } = await supabase()
        .from("tbl_licenses")
        .update({
          company_id: editCompanyId,
          license_role: editRole,
        })
        .eq("id", selectedLicense.id);

      if (error) throw error;

      toast.success(`License parameters modified successfully.`);
      setIsEditModalOpen(false);
      fetchLicenses();
    } catch (error: any) {
      toast.error(
        error.message || "Failed to adjust operational license matrix",
      );
    } finally {
      setIsMutating(false);
      setSelectedLicense(null);
    }
  };

  const handleRevokeLicense = async () => {
    if (!selectedLicense) return;
    setIsMutating(true);

    try {
      const { error } = await supabase()
        .from("tbl_licenses")
        .delete()
        .eq("id", selectedLicense.id);

      if (error) throw error;

      toast.success(`Access permissions to company workspace revoked cleanly.`);
      setIsRevokeModalOpen(false);
      fetchLicenses();
    } catch (error: any) {
      toast.error(
        error.message || "Could not clear specified target license matrix",
      );
    } finally {
      setIsMutating(false);
      setSelectedLicense(null);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set("page", newPage.toString());
      return prev;
    });
  };

  const getRoleBadge = (role: LicenseRole) => {
    const configurations = {
      admin:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400",
      sales:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
      logistic:
        "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400",
      accounting:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
    };
    return configurations[role] || "bg-gray-50 text-gray-700";
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Search Controls Layout */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users, companies, or roles..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm font-medium text-muted-foreground hidden sm:flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-indigo-500" />
            {totalCount} Total Provisioned Licenses
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Provision New License
          </Button>
        </div>
      </div>

      {/* Main Core Data Table Matrix */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>System Operator / Employee</TableHead>
              <TableHead>Corporate Workspace</TableHead>
              <TableHead>Functional Role Scope</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Querying secure permissions matrix...
                  </div>
                </TableCell>
              </TableRow>
            ) : licenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No active provisioned user licenses match the query search
                  filters.
                </TableCell>
              </TableRow>
            ) : (
              licenses.map((license) => (
                <TableRow key={license.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {`${license.tbl_employees?.first_name || ""} ${license.tbl_employees?.last_name || ""}`.trim() ||
                          "Active System Worker"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {license.tbl_employees?.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {license.tbl_companies?.company_name ||
                        "Detached Network Unit"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize font-mono tracking-tight",
                        getRoleBadge(license.license_role),
                      )}
                    >
                      {license.license_role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          disabled={isMutating}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleOpenEditModal(license)}
                          className="cursor-pointer flex items-center gap-2"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Modify License
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenRevokeModal(license)}
                          className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Revoke Access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Command Controls Footer */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="text-sm text-muted-foreground">
          Showing {licenses.length} of {totalCount} records
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

      {/* --- PROVISION NEW LICENSE DIALOG --- */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Provision Workspace License</DialogTitle>
            <DialogDescription>
              Assign an existing employee access to an alternate company profile
              container.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Searchable User Combobox */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-user-select">Select Target Employee</Label>
              <Popover
                open={isCreateUserComboOpen}
                onOpenChange={setIsCreateUserComboOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="create-user-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isCreateUserComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    {createUserId
                      ? employees.find((e) => e.id === createUserId)?.email
                      : "Search operator registry via email..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[412px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Filter operator profiles..." />
                    <CommandList>
                      <CommandEmpty>No matching accounts found.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((emp) => (
                          <CommandItem
                            key={emp.id}
                            value={emp.email}
                            onSelect={() => {
                              setCreateUserId(emp.id);
                              setIsCreateUserComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                createUserId === emp.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{emp.email}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {emp.first_name} {emp.last_name}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Searchable Corporate Combobox */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-company-select">
                Assign Enterprise Destination
              </Label>
              <Popover
                open={isCreateCompanyComboOpen}
                onOpenChange={setIsCreateCompanyComboOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="create-company-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isCreateCompanyComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    {createCompanyId
                      ? companies.find((c) => c.id === createCompanyId)
                          ?.company_name
                      : "Select company context..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[412px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Filter companies list..." />
                    <CommandList>
                      <CommandEmpty>
                        No matching enterprises recorded.
                      </CommandEmpty>
                      <CommandGroup>
                        {companies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.company_name}
                            onSelect={() => {
                              setCreateCompanyId(company.id);
                              setIsCreateCompanyComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                createCompanyId === company.id
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

            {/* Radio Items for Creation Roles */}
            <div className="flex flex-col gap-2">
              <Label>Clearance Classification Level</Label>
              <RadioGroup
                value={createRole}
                onValueChange={(val) => setCreateRole(val as LicenseRole)}
                className="grid grid-cols-2 gap-2"
              >
                {(
                  ["admin", "sales", "logistic", "accounting"] as LicenseRole[]
                ).map((role) => (
                  <label
                    key={role}
                    className="flex items-center justify-between rounded-md border p-3 bg-popover hover:bg-accent/50 cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:ring-1 [&:has([data-state=checked])]:ring-primary"
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
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateLicense}
              disabled={isMutating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Grant Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- INLINE EDIT LICENSE CONFIGURATION DIALOG --- */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Modify Operating Permissions</DialogTitle>
            <DialogDescription>
              Adjust structural networks or configuration roles assigned to{" "}
              <span className="font-semibold text-foreground">
                {selectedLicense?.tbl_employees?.email}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Searchable Corporate Combobox */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-company-select">
                Reassign Active Enterprise
              </Label>
              <Popover
                open={isEditComboboxOpen}
                onOpenChange={setIsEditComboboxOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="edit-company-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isEditComboboxOpen}
                    className="w-full justify-between font-normal"
                  >
                    {editCompanyId
                      ? companies.find((c) => c.id === editCompanyId)
                          ?.company_name
                      : "Search corporate registry..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[412px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Filter companies list..." />
                    <CommandList>
                      <CommandEmpty>
                        No matching enterprises recorded.
                      </CommandEmpty>
                      <CommandGroup>
                        {companies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.company_name}
                            onSelect={() => {
                              setEditCompanyId(company.id);
                              setIsEditComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                editCompanyId === company.id
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

            {/* Radio Action Items for Roles */}
            <div className="flex flex-col gap-2">
              <Label>Alter Clearance Classification Level</Label>
              <RadioGroup
                value={editRole}
                onValueChange={(val) => setEditRole(val as LicenseRole)}
                className="grid grid-cols-2 gap-2"
              >
                {(
                  ["admin", "sales", "logistic", "accounting"] as LicenseRole[]
                ).map((role) => (
                  <label
                    key={role}
                    className="flex items-center justify-between rounded-md border p-3 bg-popover hover:bg-accent/50 cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:ring-1 [&:has([data-state=checked])]:ring-primary"
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
              onClick={() => setIsEditModalOpen(false)}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateLicense}
              disabled={isMutating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Commit Adjustments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- INLINE PERMANENT REVOCATION CONFIRMATION DIALOG --- */}
      <Dialog open={isRevokeModalOpen} onOpenChange={setIsRevokeModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Revoke System Access Credentials?
            </DialogTitle>
            <DialogDescription>
              Are you completely sure you want to strip structural permissions
              from{" "}
              <span className="font-semibold text-foreground">
                {selectedLicense?.tbl_employees?.email}
              </span>
              ? They will be disconnected from{" "}
              <span className="font-medium text-foreground">
                {selectedLicense?.tbl_companies?.company_name}
              </span>{" "}
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsRevokeModalOpen(false)}
              disabled={isMutating}
            >
              Retain Credentials
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeLicense}
              disabled={isMutating}
            >
              {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Revocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
