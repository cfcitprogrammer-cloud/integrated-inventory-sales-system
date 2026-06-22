import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "../views/layouts/dashboard";
import { publicRoutes, protectedRoutes, AuthorizeGuard } from "./routes";
import DB from "@/views/pages/audit/db";

export default function AppRouter() {
  return (
    <BrowserRouter basename="/integrated-inventory-sales-system">
      <Routes>
        {/* Default Route Redirect */}
        <Route path="/" element={<Navigate to="/a/signin" replace />} />

        <Route path="/db" element={<DB />} />

        {/* Public Auth Layer Tree */}
        {publicRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}

        {/* Protected Dashboard Architecture Viewport Layer */}
        {protectedRoutes.map((group) => (
          <Route
            key={group.path}
            element={
              <AuthorizeGuard
                allowedRoles={group.allowedRoles}
                allowPending={group.allowPending}
              />
            }
          >
            {group.children ? (
              // Handle Nested child routes (e.g. /d/admin/companies)
              group.children.map((child) => (
                <Route
                  key={`${group.path}/${child.path}`}
                  path={`${group.path}/${child.path}`}
                  element={<DashboardLayout>{child.element}</DashboardLayout>}
                />
              ))
            ) : (
              // Handle top-level single routes (e.g. /d/pending-activation)
              <Route
                path={group.path}
                element={
                  group.allowPending ? (
                    group.element
                  ) : (
                    <DashboardLayout>{group.element}</DashboardLayout>
                  )
                }
              />
            )}
          </Route>
        ))}

        {/* Global Fallback Route */}
        <Route path="*" element={<Navigate to="/a/signin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
