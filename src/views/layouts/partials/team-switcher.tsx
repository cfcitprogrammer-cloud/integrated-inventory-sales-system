"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { ChevronsUpDown, Building2, Loader2 } from "lucide-react";
import { supabaseClients } from "@/config/db";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface CompanyNode {
  id: string;
  name: string;
  role: string;
}

export function TeamSwitcher() {
  const { isMobile } = useSidebar();
  const [companies, setCompanies] = useState<CompanyNode[]>([]);
  const [activeCompany, setActiveCompany] = useState<CompanyNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function resolveAssignedCompanies() {
      try {
        const mainClient = supabaseClients["sales.server.main"];
        const {
          data: { session },
        } = await mainClient.auth.getSession();

        if (!session?.user) return;

        // Fetch all licenses joined with company names for this user
        const { data, error } = await mainClient
          .from("tbl_licenses")
          .select(
            `
            license_role,
            company_id,
            tbl_companies (
              company_name
            )
          `,
          )
          .eq("user_id", session.user.id);

        if (error) throw error;

        if (data && data.length > 0) {
          // Format raw relational payloads into clear workspace units
          const formattedCompanies: CompanyNode[] = data.map((item: any) => ({
            id: item.company_id,
            name: item.tbl_companies?.company_name || "Unknown Entity",
            role: item.license_role,
          }));

          setCompanies(formattedCompanies);

          // Fallback to memory or default first entry
          const savedTargetId = localStorage.getItem(
            "active_workspace_company_id",
          );
          const matchedSelection = formattedCompanies.find(
            (c) => c.id === savedTargetId,
          );

          const currentActive = matchedSelection || formattedCompanies[0];
          setActiveCompany(currentActive);
          localStorage.setItem("active_workspace_company_id", currentActive.id);
        }
      } catch (err) {
        console.error(
          "Failed to fetch tenant spaces for current operator context:",
          err,
        );
      } finally {
        setIsLoading(false);
      }
    }

    resolveAssignedCompanies();
  }, []);

  const handleCompanySwitch = (company: CompanyNode) => {
    setActiveCompany(company);
    localStorage.setItem("active_workspace_company_id", company.id);

    // Optional: Dispatch a global window event or reload if your other system panels
    // (like stocks or returns query controllers) need to force refetch based on the new ID context.
    window.dispatchEvent(new Event("workspaceCompanyChanged"));
  };

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="text-muted-foreground text-xs">
                Resolving workspace context...
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Fallback display if an account is sitting in the pending state without assigned licenses
  if (!activeCompany) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              <Building2 className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-amber-600">
                Unassigned Status
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Awaiting Approval
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-indigo-600 text-white dark:bg-indigo-500">
                <Building2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-foreground">
                  {activeCompany.name}
                </span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {activeCompany.role} Account
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Accessible Companies
            </DropdownMenuLabel>
            {companies.map((company) => (
              <DropdownMenuItem
                key={company.id}
                onClick={() => handleCompanySwitch(company)}
                className="gap-2 p-2 cursor-pointer"
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-sm font-medium">{company.name}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {company.role}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
