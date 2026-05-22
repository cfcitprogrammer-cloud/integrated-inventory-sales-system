import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/config/db";

// Shadcn UI Components
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Types
interface Company {
  id: string; // Assuming standard UUID or serial ID exists
  company_name: string;
  company_description: string | null;
  is_active: boolean;
  created_at?: string;
}

interface CompanyManagementProps {
  enableBulkDelete?: boolean;
}

const ITEMS_PER_PAGE = 10;

export default function CompanyManagement({
  enableBulkDelete = false,
}: CompanyManagementProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL State Extraction
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  // Local State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Form & Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    company_name: "",
    company_description: "",
    is_active: true,
  });

  // --- Data Fetching ---
  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase()
        .from("tbl_companies")
        .select("*", { count: "exact" });

      if (searchQuery) {
        query = query.ilike("company_name", `%${searchQuery}%`);
      }

      // Pagination & Sorting
      const { data, count, error } = await query
        .order("company_name", { ascending: true })
        .range(from, to);

      if (error) throw error;

      setCompanies(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch companies");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // --- URL State Handlers ---
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchParams((prev) => {
      if (val) prev.set("search", val);
      else prev.delete("search");
      prev.set("page", "1"); // Reset to page 1 on new search
      return prev;
    });
    setSelectedIds([]);
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set("page", newPage.toString());
      return prev;
    });
  };

  // --- Mutation Actions ---
  const openCreateModal = () => {
    setEditingCompany(null);
    setFormData({ company_name: "", company_description: "", is_active: true });
    setIsFormOpen(true);
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      company_name: company.company_name,
      company_description: company.company_description || "",
      is_active: company.is_active,
    });
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim())
      return toast.error("Company name is required");

    setIsSubmitting(true);
    try {
      if (editingCompany) {
        // Edit Mode
        const { error } = await supabase()
          .from("tbl_companies")
          .update(formData)
          .eq("id", editingCompany.id);

        if (error) throw error;
        toast.success("Company updated successfully");
      } else {
        // Create Mode
        const { error } = await supabase()
          .from("tbl_companies")
          .insert([formData]);

        if (error) throw error;
        toast.success("Company created successfully");
      }
      setIsFormOpen(false);
      fetchCompanies();
    } catch (error: any) {
      toast.error(error.message || "An error occurred saving changes");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase()
        .from("tbl_companies")
        .delete()
        .eq("id", companyToDelete.id);

      if (error) throw error;
      toast.success(`${companyToDelete.company_name} deleted successfully`);
      setIsDeleteOpen(false);
      setCompanyToDelete(null);
      // Adjust page if last item on page is deleted
      if (companies.length === 1 && currentPage > 1) {
        handlePageChange(currentPage - 1);
      } else {
        fetchCompanies();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete company");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase()
        .from("tbl_companies")
        .delete()
        .in("id", selectedIds);

      if (error) throw error;
      toast.success(`${selectedIds.length} companies deleted successfully`);
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      fetchCompanies();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete selected companies");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Checkbox Helpers ---
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(companies.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="w-full space-y-4 p-6">
      <h1>sd</h1>

      {/* Top Controls Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {enableBulkDelete && selectedIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button onClick={openCreateModal} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Company
          </Button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {enableBulkDelete && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={
                      companies.length > 0 &&
                      selectedIds.length === companies.length
                    }
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    aria-label="Select all rows"
                  />
                </TableHead>
              )}
              <TableHead>Company Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={enableBulkDelete ? 5 : 4}
                  className="h-48 text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading resources...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : companies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={enableBulkDelete ? 5 : 4}
                  className="h-32 text-center text-muted-foreground"
                >
                  No companies found.
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id}>
                  {enableBulkDelete && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(company.id)}
                        onCheckedChange={(checked) =>
                          handleSelectRow(company.id, !!checked)
                        }
                        aria-label={`Select ${company.company_name}`}
                      />
                    </TableCell>
                  )}
                  <td className="p-4 font-medium">{company.company_name}</td>
                  <td className="p-4 max-w-[300px] truncate text-muted-foreground">
                    {company.company_description || "—"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                        company.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {company.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEditModal(company)}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setCompanyToDelete(company);
                            setIsDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1">
          <div className="text-sm text-muted-foreground">
            Showing Page <b>{currentPage}</b> of <b>{totalPages}</b> (
            {totalCount} total rows)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* --- MODALS (Embedded Inside Component) --- */}

      {/* Form Dialog (Add / Edit) */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? "Edit Company" : "Add New Company"}
            </DialogTitle>
            <DialogDescription>
              Make changes to the company records here. Click save when you're
              done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Company Name</label>
              <Input
                required
                placeholder="Acme Corp"
                value={formData.company_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    company_name: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional description"
                value={formData.company_description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    company_description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: !!checked }))
                }
              />
              <label
                htmlFor="is_active"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Mark company as Active
              </label>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}{" "}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">
              Are you absolutely sure?
            </DialogTitle>
            <DialogDescription className="text-center">
              This action cannot be undone. This will permanently delete{" "}
              <b className="text-foreground">{companyToDelete?.company_name}</b>{" "}
              from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">
              Delete Selected Items?
            </DialogTitle>
            <DialogDescription className="text-center">
              Are you sure you want to delete{" "}
              <b className="text-destructive">
                {selectedIds.length} selected records
              </b>
              ? This execution is irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsBulkDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeleteConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Mass Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
