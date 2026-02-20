import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordStart, forgotPasswordVerify } from "../api/auth";

const schema = z
  .object({
    email: z.string().email(),
    otp: z.string().length(6),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      otp: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  const handleSendOtp = async () => {
    setError(null);
    setMessage(null);
    setDevOtp(null);
    const email = getValues("email");
    if (!email) {
      setError("Email required");
      return;
    }
    setSendingOtp(true);
    try {
      const result = await forgotPasswordStart(email);
      setMessage(result.message || "OTP sent to your email");
      if (result.devOtp) {
        setDevOtp(result.devOtp);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not send OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setMessage(null);
    try {
      await forgotPasswordVerify({
        email: values.email,
        otp: values.otp,
        newPassword: values.newPassword
      });
      setMessage("Password reset successful. Please login.");
      window.setTimeout(() => navigate("/login"), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Reset failed. Check email, OTP, and password.");
    }
  };

  return (
    <section className="panel">
      <h1 className="page-title">Reset Password</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>Email</label>
        <input type="email" {...register("email")} />
        {errors.email && <span className="error">Enter a valid email</span>}

        <button className="ghost" type="button" onClick={handleSendOtp} disabled={sendingOtp}>
          {sendingOtp ? "Sending OTP..." : "Send OTP"}
        </button>

        <label>OTP</label>
        <input {...register("otp")} maxLength={6} />
        {errors.otp && <span className="error">Enter 6-digit OTP</span>}

        <label>New Password</label>
        <input type="password" {...register("newPassword")} />
        {errors.newPassword && <span className="error">Minimum 8 characters</span>}

        <label>Confirm Password</label>
        <input type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && <span className="error">{errors.confirmPassword.message}</span>}

        {error && <span className="error">{error}</span>}
        {message && <span className="helper">{message}</span>}
        {devOtp && <span className="helper">Dev OTP: {devOtp}</span>}

        <button className="button" type="submit" disabled={isSubmitting}>
          Reset Password
        </button>

        <p className="helper">
          Back to <Link to="/login">Login</Link>
        </p>
      </form>
    </section>
  );
}