import AuthLayout from "@/views/layouts/auth";
import { SignupForm } from "@/views/layouts/forms/signup-form";

export default function SignupPage() {
  return (
    <AuthLayout>
      <SignupForm />
    </AuthLayout>
  );
}
