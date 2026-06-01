import { useEffect, useState, useCallback } from "react";
import { supabaseClients } from "@/config/db";
import { toast } from "sonner";
import {
  Loader2,
  Building2,
  Shield,
  Calendar,
  Key,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { EmployeeData } from "./all-employees";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface DetailViewProps {
  employeeId: string;
  onLicenseChange: () => void;
}

export default function EmployeeDetailView({ employeeId }: DetailViewProps) {
  const [profile, setProfile] = useState<EmployeeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfileDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      // Explicitly accessing the pre-instantiated client locked onto your main server block
      const { data, error } = await supabaseClients["sales.server.main"]
        .from("tbl_employees")
        .select(
          `
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
        `,
        )
        .eq("id", employeeId)
        .single();

      if (error) throw error;
      setProfile(data as unknown as EmployeeData);
    } catch (error: any) {
      toast.error(
        "Failed to load extensive profile records from primary cluster.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchProfileDetails();
  }, [fetchProfileDetails]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading secure
        personnel token parameters...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center p-6 border border-destructive/20 text-destructive bg-destructive/5 rounded-md">
        Target profile records could not be found or have been deleted.
      </div>
    );
  }

  const hasLicense = profile.tbl_licenses && profile.tbl_licenses.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start">
      {/* Column 1: Identity Profile Summary Card */}
      <Card className="lg:col-span-1 shadow-sm">
        <CardHeader className="space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
            {profile.first_name
              ? profile.first_name[0].toUpperCase()
              : profile.email[0].toUpperCase()}
          </div>
          <div>
            <CardTitle className="text-xl">
              {profile.first_name || profile.last_name
                ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
                : "Profile Unnamed"}
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {profile.id}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Email Address
              </span>
              <span className="font-medium text-foreground">
                {profile.email}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Registered
              </span>
              <span className="font-medium text-foreground">
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })}
              </span>
            </div>

            <Link to={`/d/audit/employees/${profile.id}/kpi`}>
              <Button>See Employee KPI</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Column 2 & 3: License Control Matrix */}
      <Card className="lg:col-span-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-500" /> Active System Licenses
          </CardTitle>
          <CardDescription>
            Core security tokens granting access permissions inside
            organizational tenants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasLicense ? (
            <div className="space-y-4">
              {profile.tbl_licenses!.map((license, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-muted/30 gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-background border text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {license.tbl_companies?.company_name ||
                          "Detached Corporate Entity"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Assigned Enterprise Node
                      </p>
                    </div>
                  </div>

                  <div>
                    <Badge
                      variant="secondary"
                      className="capitalize font-mono text-xs tracking-tight bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 px-3 py-1"
                    >
                      Role Scope: {license.license_role}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-lg bg-amber-50/20 dark:bg-amber-950/5">
              <ShieldAlert className="h-8 w-8 text-amber-500 mb-2" />
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                Account Access Frozen
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                This employee profile has no functional operational clearance
                mapping vectors. Go to the approvals page to provision a
                license.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
