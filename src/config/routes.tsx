import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabaseClients } from "./db";
import { Loader2 } from "lucide-react";

// Route Page Imports
import AllCompaniesPage from "@/views/pages/admin/company/company";
import AllEmployeesPage from "@/views/pages/admin/employees/all-employees";
import PendingApprovalsPage from "@/views/pages/admin/employees/approvals";
import LicensesPage from "@/views/pages/admin/employees/licenses";
import LoginPage from "@/views/pages/auth/login-page";
import SignupPage from "@/views/pages/auth/signup-page";
import ReturnsPage from "@/views/pages/inventory/returns-page";
import StocksOnHandPage from "@/views/pages/inventory/stocks-on-hand-page";
import SalesInventoryPage from "@/views/pages/sales/inventory-page";
import BadOrdersManagement from "@/views/pages/sales/bad-order-request-page";
import SalesAllInventoryPage from "@/views/pages/sales/all-inventory";
import SalesAllSTTPage from "@/views/pages/sales/all-stt";
import SalesSTTPage from "@/views/pages/sales/stt";
import CreateBadOrderPage from "@/views/pages/sales/create-bo";
import BadOrdersListPage from "@/views/pages/sales/bad-order-request-page";
import ViewBadOrderDetailsPage from "@/views/pages/sales/view-bo";
import AccountingDirectDisposalPage from "@/views/pages/accounting/direct-disposals";
import AccountingViewDirectDisposalPage from "@/views/pages/accounting/view-direct-disposal";
import LogisticsReturnToWHPage from "@/views/pages/logistics/return-to-wh";
import LogisticsViewReturnWarehousePage from "@/views/pages/logistics/view-return-to-wh";
import AccountingViewWarehouseReturnPage from "@/views/pages/accounting/view-wh-returns";
import SalesToTradeReportPage from "@/views/pages/reports/stt";
import BadOrderReportPage from "@/views/pages/reports/bo";
import AccountingReturnToWHPage from "@/views/pages/accounting/wh-returns";
import SalesInventoryViewPage from "@/views/pages/sales/view-inventory";
import AuditValidateInventoryPage from "@/views/pages/audit/validate-inventory";
import AuditRegistryDashboard from "@/views/pages/audit/inventory-registry-dashboard";
import AuditInspectionViewer from "@/views/pages/audit/inspection-viewer";
import ValidatedAuditDiscrepancyReport from "@/views/pages/reports/inventory-audit";
import EmployeeKpiDashboard from "@/views/pages/reports/employee-kpi-dashboard";

function PendingActivationPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center p-6 bg-background">
      <h2 className="text-xl font-bold text-amber-600 mb-2">
        Registration Received Successfully
      </h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Your user instance is registered. An administrator must provision an
        active license and corporate link before access can be granted.
      </p>
    </div>
  );
}

interface GuardProps {
  allowedRoles?: readonly ("admin" | "sales" | "logistic" | "accounting")[];
  allowPending?: boolean;
}

export function AuthorizeGuard({
  allowedRoles,
  allowPending = false,
}: GuardProps) {
  const location = useLocation();
  const [authState, setAuthState] = useState<{
    checking: boolean;
    isAuthenticated: boolean;
    isPendingApproval: boolean;
    role: string | null;
  }>({
    checking: true,
    isAuthenticated: false,
    isPendingApproval: false,
    role: null,
  });

  useEffect(() => {
    async function evaluateSecurityContext() {
      try {
        const mainClient = supabaseClients["sales.server.main"];
        const {
          data: { session },
        } = await mainClient.auth.getSession();

        if (!session) {
          setAuthState({
            checking: false,
            isAuthenticated: false,
            isPendingApproval: false,
            role: null,
          });
          return;
        }

        // 🟢 FIXED: Read chosen tenant coordinates directly out of local memory cache
        const cachedCompanyId = localStorage.getItem("active_company_id");
        const cachedRole = localStorage.getItem("active_role");

        if (!cachedCompanyId || !cachedRole) {
          // If authenticated but missing selected coordinates, check if database matches ANY row
          const { data: licenses } = await mainClient
            .from("tbl_licenses")
            .select("license_role, company_id")
            .eq("user_id", session.user.id);

          if (!licenses || licenses.length === 0) {
            // Truly a pending user instance with no organizational access
            setAuthState({
              checking: false,
              isAuthenticated: true,
              isPendingApproval: true,
              role: null,
            });
          } else {
            // User has licenses but cleared cache/cookies; bounce back to signin screen to select tenant context
            setAuthState({
              checking: false,
              isAuthenticated: false,
              isPendingApproval: false,
              role: null,
            });
          }
        } else {
          // Context confirmed valid! Load the selected active workspace scope configurations
          setAuthState({
            checking: false,
            isAuthenticated: true,
            isPendingApproval: false,
            role: cachedRole,
          });
        }
      } catch {
        setAuthState({
          checking: false,
          isAuthenticated: false,
          isPendingApproval: false,
          role: null,
        });
      }
    }
    evaluateSecurityContext();
  }, [location.pathname]);

  if (authState.checking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return <Navigate to="/a/signin" state={{ from: location }} replace />;
  }

  if (authState.isPendingApproval && !allowPending) {
    return <Navigate to="/d/pending-activation" replace />;
  }

  if (
    allowedRoles &&
    authState.role &&
    !allowedRoles.includes(authState.role as any)
  ) {
    return <Navigate to="/d/inventory/stocks-on-hand" replace />;
  }

  return <Outlet />;
}

// Routes Configurations
export const publicRoutes = [
  { path: "/a/signup", element: <SignupPage /> },
  { path: "/a/signin", element: <LoginPage /> },
];

export const protectedRoutes = [
  {
    path: "/d/pending-activation",
    element: <PendingActivationPage />,
    allowPending: true,
  },
  {
    path: "/d/inventory",
    allowedRoles: ["admin", "sales", "logistic", "accounting"] as const,
    children: [
      { path: "stocks-on-hand", element: <StocksOnHandPage /> },
      { path: "returns", element: <ReturnsPage /> },
    ],
  },
  {
    path: "/d/admin",
    allowedRoles: ["admin"] as const,
    children: [
      { path: "companies", element: <AllCompaniesPage /> },
      { path: "approvals", element: <PendingApprovalsPage /> },
      { path: "licenses", element: <LicensesPage /> },
      { path: "employees", element: <AllEmployeesPage /> },
    ],
  },
  {
    path: "/d/sales",
    allowedRoles: ["sales", "admin"] as const,
    children: [
      { path: "add-inventory", element: <SalesInventoryPage /> },
      { path: "add-stt", element: <SalesSTTPage /> },
      { path: "my-inventory", element: <SalesAllInventoryPage /> },
      { path: "view-inventory/:bp_code", element: <SalesInventoryViewPage /> },
      { path: "my-stt/:page", element: <SalesAllSTTPage /> },
      { path: "bo/:page", element: <BadOrdersListPage /> },
      { path: "add-bo", element: <CreateBadOrderPage /> },
      { path: "view/bo/:id", element: <ViewBadOrderDetailsPage /> },
    ],
  },
  {
    path: "/d/accounting",
    allowedRoles: ["accounting", "admin"] as const,
    children: [
      {
        path: "direct-disposals/:id",
        element: <AccountingDirectDisposalPage />,
      },
      {
        path: "view/direct-disposals/:id",
        element: <AccountingViewDirectDisposalPage />,
      },
      {
        path: "return-wh/:page",
        element: <AccountingReturnToWHPage />,
      },
      {
        path: "view/return-wh/:id",
        element: <AccountingViewWarehouseReturnPage />,
      },
    ],
  },
  {
    path: "/d/logistics",
    allowedRoles: ["logistic", "admin"] as const,
    children: [
      {
        path: "return-wh/:page",
        element: <LogisticsReturnToWHPage />,
      },
      {
        path: "view/return-wh/:id",
        element: <LogisticsViewReturnWarehousePage />,
      },
    ],
  },

  {
    path: "/d/audit",
    allowedRoles: ["audit", "admin"] as const,
    children: [
      {
        path: "stt",
        element: <SalesToTradeReportPage />,
      },
      {
        path: "bo",
        element: <BadOrderReportPage />,
      },
      {
        path: "inventory-audit",
        element: <ValidatedAuditDiscrepancyReport />,
      },
      {
        path: "validate-inventory",
        element: <AuditValidateInventoryPage />,
      },
      {
        path: "registry",
        element: <AuditRegistryDashboard />,
      },
      {
        path: "registry/view/:auditId",
        element: <AuditInspectionViewer />,
      },
      {
        path: "employees/:employee_id/kpi",
        element: <EmployeeKpiDashboard />,
      },
    ],
  },
];
