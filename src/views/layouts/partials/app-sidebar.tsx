"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { supabaseClients } from "@/config/db";
import {
  AudioWaveform,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  PieChart,
  Loader2,
  Building2,
} from "lucide-react";

import { NavMain } from "./nav-main";
import { NavAdmin } from "./nav-admin";
import { NavUser } from "./nav-user";
import { TeamSwitcher } from "./team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavSales } from "./nav-sales";
import { NavLogistics } from "./nav-logistics";
import { NavAccounting } from "./nav-accounting";

interface CompanyTeam {
  name: string;
  logo: React.ComponentType;
  plan: string;
  id: string;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userData, setUserData] = useState({ name: "Employee", email: "" });
  const [isLoading, setIsLoading] = useState(true);

  // Real dynamic workspace array state
  const [userCompanies, setUserCompanies] = useState<CompanyTeam[]>([]);

  useEffect(() => {
    async function getRuntimeProfile() {
      try {
        const mainClient = supabaseClients["sales.server.main"];
        const {
          data: { session },
        } = await mainClient.auth.getSession();

        if (session?.user) {
          // 1. Resolve basic identity profile layout
          setUserData({
            name:
              session.user.user_metadata?.first_name ||
              session.user.email?.split("@")[0] ||
              "User",
            email: session.user.email || "",
          });

          // 2. FIXED: Trust cached active role instead of hitting database with .maybeSingle()
          const cachedRole = localStorage.getItem("active_role");
          if (cachedRole) {
            setUserRole(cachedRole);
          }

          // 3. ENHANCEMENT: Populate TeamSwitcher options with their actual licensed companies
          const { data: licenses } = await mainClient
            .from("tbl_licenses")
            .select("company_id");

          if (licenses && licenses.length > 0) {
            const companyIds = licenses.map((l) => l.company_id);
            const { data: companies } = await mainClient
              .from("tbl_companies")
              .select("id, company_name")
              .in("id", companyIds);

            if (companies) {
              const logos = [GalleryVerticalEnd, AudioWaveform, Command];
              const formattedTeams: CompanyTeam[] = companies.map((c, idx) => ({
                id: c.id,
                name: c.company_name,
                logo: logos[idx % logos.length] || Building2, // Cycle icons or fallback
                plan: "Enterprise Workspace",
              }));
              setUserCompanies(formattedTeams);
            }
          }
        }
      } catch (error) {
        console.error("Error building context mapping variables:", error);
      } finally {
        setIsLoading(false);
      }
    }
    getRuntimeProfile();
  }, []);

  // Standard routes accessible by all verified employees
  const navMainItems = [
    {
      title: "Inventory",
      url: "/d/inventory/stocks-on-hand",
      icon: Bot,
      items: [
        { title: "Stocks On-Hand", url: "/d/inventory/stocks-on-hand" },
        { title: "Returns (Bad Orders)", url: "/d/inventory/returns" },
        { title: "Sales To Trade", url: "/d/inventory/returns" },
      ],
    },
    {
      title: "Reports",
      url: "/d/inventory/stocks-on-hand",
      icon: Bot,
      items: [
        { title: "Stocks On-Hand", url: "/d/inventory/stocks-on-hand" },
        { title: "Returns (Bad Orders)", url: "/d/inventory/returns" },
      ],
    },
    {
      title: "AI Tools",
      url: "/d/inventory/stocks-on-hand",
      icon: Bot,
      items: [
        { title: "Stocks On-Hand", url: "/d/inventory/stocks-on-hand" },
        { title: "Returns (Bad Orders)", url: "/d/inventory/returns" },
      ],
    },
  ];

  // Administrative control groups
  const adminItems = [
    {
      title: "Employees",
      url: "#",
      icon: Frame,
      items: [
        { title: "All Employees", url: "/d/admin/employees" },
        { title: "Approvals", url: "/d/admin/approvals" },
        { title: "Licenses", url: "/d/admin/licenses" },
      ],
    },
    {
      title: "Companies",
      url: "#",
      icon: PieChart,
      items: [{ title: "All Companies", url: "/d/admin/companies" }],
    },
  ];

  const salesItems = [
    {
      title: "Inventory",
      url: "#",
      icon: Frame,
      items: [
        { title: "My Inventory", url: "/d/sales/my-inventory" },
        { title: "Add Inventory", url: "/d/sales/inventory" },
      ],
    },
    {
      title: "Bad Order",
      url: "#",
      icon: PieChart,
      items: [{ title: "My BO/Returns", url: "/d/sales/bo" }],
    },
    {
      title: "Sales to Trade",
      url: "#",
      icon: PieChart,
      items: [
        { title: "My STT", url: "/d/sales/my-stt" },
        { title: "Add STT", url: "/d/sales/stt" },
      ],
    },
  ];

  const accountingItems = [
    {
      title: "Returning to Warehouse",
      url: "#",
      icon: PieChart,
    },
    {
      title: "Direct Disposals",
      url: "#",
      icon: PieChart,
    },
  ];

  const logisticsItems = [
    {
      title: "Returning to Warehouse",
      url: "#",
      icon: PieChart,
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {/* Pass down real, fetched companies to your switcher component */}
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-6 gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading profile configurations...
          </div>
        ) : (
          <>
            <NavMain items={navMainItems} />

            {/* Admin layout successfully renders using local context state parameters */}
            {userRole === "admin" && <NavAdmin items={adminItems} />}

            {(userRole === "admin" || userRole === "sales") && (
              <NavSales items={salesItems} />
            )}

            {(userRole === "admin" || userRole === "accounting") && (
              <NavAccounting items={accountingItems} />
            )}

            {(userRole === "admin" || userRole === "logistics") && (
              <NavLogistics items={logisticsItems} />
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
