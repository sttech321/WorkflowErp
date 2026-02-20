import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { login } from "../api/auth";
import { setTokens } from "../lib/authStorage";
import { Link } from "react-router-dom";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type FormValues = z.infer<typeof schema>;

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const result = await login(values);
      setTokens(result.tokens.accessToken, result.tokens.refreshToken);
      navigate("/dashboard");
    } catch (err) {
      setError("Login failed");
    }
  };

  return (
    <section className="panel">
      <h1 className="page-title">Login</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>Email</label>
        <input type="email" {...register("email")} />
        {errors.email && <span className="error">Enter a valid email</span>}

        <label>Password</label>
        <input type="password" {...register("password")} />
        {errors.password && <span className="error">Enter your password</span>}

        {error && <span className="error">{error}</span>}

        <button className="button" type="submit" disabled={isSubmitting}>
          Sign In
        </button>
        <p className="helper">
          Forgot password? <Link to="/reset-password">Reset here</Link>
        </p>
      </form>
    </section>
  );
}
