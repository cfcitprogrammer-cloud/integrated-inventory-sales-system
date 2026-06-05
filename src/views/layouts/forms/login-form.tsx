import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabaseClients } from "@/config/db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Building2, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Define structured license record type
interface UserLicense {
  license_role: "admin" | "sales" | "logistic" | "accounting";
  company_id: string;
  tbl_companies: {
    company_name: string;
  };
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New multi-company state parameters
  const [userLicenses, setUserLicenses] = useState<UserLicense[]>([]);
  const [showCompanySelector, setShowCompanySelector] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. Authenticate with your designated primary node
      const { data: authData, error: authError } = await supabaseClients[
        "sales.server.main"
      ].auth.signInWithPassword({ email, password });

      if (authError) throw authError;
      if (!authData.user)
        throw new Error("Authentication layer failed to yield user token.");

      // 2. FIXED: Fetch ALL available license profiles instead of forcing a single record
      const { data: licenses, error: licenseError } = await supabaseClients[
        "sales.server.main"
      ]
        .from("tbl_licenses")
        .select(
          `
          license_role, 
          company_id,
          tbl_companies!inner ( company_name )
        `,
        )
        .eq("user_id", authData.user.id);

      if (licenseError) throw licenseError;

      // 3. Evaluate multi-origin deployment metrics
      if (!licenses || licenses.length === 0) {
        toast.warning(
          "Account pending approval. Awaiting system administrator license assignment.",
        );
        navigate("/integrated-inventory-sales-system/d/pending-activation");
        return;
      }

      // Safe casting for nested inner joins structures
      const formattedLicenses = licenses as unknown as UserLicense[];

      if (formattedLicenses.length === 1) {
        // If they only have one company, bypass selection UI and route directly
        routeToWorkspace(formattedLicenses[0]);
      } else {
        // Multi-tenant worker found: save licenses and swap view to selection layout
        setUserLicenses(formattedLicenses);
        setShowCompanySelector(true);
        toast.success(
          "Identity authenticated. Please select an active workspace.",
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Invalid authentication credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dedicated routing utility based on selected role scope and workspace context
  const routeToWorkspace = (license: UserLicense) => {
    // Save active company context to state managers or local memory
    localStorage.setItem("active_company_id", license.company_id);
    localStorage.setItem("active_role", license.license_role);

    toast.success(`Access tokens confirmed. Workspace context established.`);

    if (license.license_role === "admin") {
      navigate("/d/admin/employees");
    } else {
      navigate("/d/inventory/stocks-on-hand");
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        {!showCompanySelector ? (
          <>
            <CardHeader>
              <CardTitle>Login to your account</CardTitle>
              <CardDescription>
                Enter your email below to login to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <a
                        href="#"
                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </a>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Login
                    </Button>
                    <FieldDescription className="text-center">
                      Don&apos;t have an account?{" "}
                      <Link to={"/a/signup"}>Sign Up</Link>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </>
        ) : (
          /* --- TARGET TENANT SELECTION COMPONENT LAYER --- */
          <>
            <CardHeader>
              <CardTitle>Select a Workspace</CardTitle>
              <CardDescription>
                Your account is linked to multiple organizational networks.
                Choose a session context:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {userLicenses.map((license, idx) => (
                  <button
                    key={idx}
                    onClick={() => routeToWorkspace(license)}
                    className="flex items-center justify-between p-4 rounded-xl border border-border bg-card transition-all text-left group w-full"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {license.tbl_companies?.company_name}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize font-mono">
                          Role: {license.license_role}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-all" />
                  </button>
                ))}

                <Button
                  variant="ghost"
                  onClick={() => setShowCompanySelector(false)}
                  className="mt-2 text-sm text-muted-foreground"
                >
                  Back to credential sign in
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
