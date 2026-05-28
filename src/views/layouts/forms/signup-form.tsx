import { useState } from "react";
import { GalleryVerticalEnd } from "lucide-react";
import { toast } from "sonner"; // Import Sonner toast helper

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { supabase } from "@/config/db";
import { Link } from "react-router-dom";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // 1. Form States
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // 2. Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.id]: e.target.value,
    }));
  };

  // 3. Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { firstName, lastName, email, password, confirmPassword } = formData;

    // --- Validation Toast ---
    if (password !== confirmPassword) {
      toast.error("Validation Error", {
        description: "Passwords do not match. Please try again.",
      });
      return;
    }

    if (password.length < 6) {
      toast.error("Validation Error", {
        description: "Password must be at least 6 characters long.",
      });
      return;
    }

    setLoading(true);
    // Initialize loading status toast
    const toastId = toast.loading("Creating your profile...");

    try {
      // Step A: Sign up user using Supabase Auth
      const { data: authData, error: authError } = await supabase().auth.signUp(
        {
          email,
          password,
        },
      );

      if (authError) throw authError;

      const user = authData?.user;

      // Step B: Save profile metadata to tbl_employee
      if (user) {
        const { error: dbError } = await supabase()
          .from("tbl_employees")
          .insert([
            {
              id: user.id,
              first_name: firstName,
              last_name: lastName,
              email: email,
            },
          ]);

        if (dbError) throw dbError;

        // --- Success Toast Updates ---
        toast.success("Account created successfully!", {
          id: toastId,
          description:
            "Welcome to the team! Please contact administrator for approval.",
        });
        setSuccess(true);
      }
    } catch (err: any) {
      // --- Error Toast Updates ---
      toast.error("Signup Failed", {
        id: toastId,
        description:
          err.message || "An unexpected error occurred during registration.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={cn("text-center p-6 space-y-4", className)}>
        <h2 className="text-xl font-bold text-green-600">Account Created!</h2>
        <p className="text-sm text-muted-foreground">
          Please wait for administrator approval for your account before logging
          in.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex flex-col items-center gap-2 font-medium">
              <div className="flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="sr-only">Acme Inc.</span>
            </div>
            <h1 className="text-xl font-bold">Welcome Back</h1>
            <FieldDescription>
              Already have an account? <Link to="/a/signin">Sign in</Link>
            </FieldDescription>
          </div>

          {/* First Name & Last Name (Grid Layout) */}
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="firstName">First Name</FieldLabel>
              <Input
                id="firstName"
                type="text"
                placeholder="John"
                value={formData.firstName}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
              <Input
                id="lastName"
                type="text"
                placeholder="Doe"
                value={formData.lastName}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </Field>
          </div>

          {/* Email */}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              required
            />
          </Field>

          {/* Password */}
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              required
            />
          </Field>

          {/* Confirm Password */}
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              required
            />
          </Field>

          {/* Submit Button */}
          <Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
