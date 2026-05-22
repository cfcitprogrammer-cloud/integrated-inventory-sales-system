import AuthLayout from "@/views/layouts/auth";
import { LoginForm } from "@/views/layouts/forms/login-form";

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}
