import api, { requestWithFallback } from "./client";
import type { Tokens, User } from "./types";

export async function login(payload: {
  email: string;
  password: string;
}): Promise<{ tokens: Tokens; user: User }> {
  const response = await api.post("/auth/login", payload);
  return {
    tokens: {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken
    },
    user: response.data.user
  };
}

export async function forgotPasswordStart(email: string): Promise<{ message: string; devOtp?: string }> {
  const response = await requestWithFallback<{ message: string; devOtp?: string }>(
    "post",
    "/auth/forgot-password/start",
    { email },
    ["/auth/forgot/start", "/auth/reset-password/start"]
  );
  return response.data as { message: string; devOtp?: string };
}

export async function forgotPasswordVerify(payload: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<void> {
  await requestWithFallback(
    "post",
    "/auth/forgot-password/verify",
    payload,
    ["/auth/forgot/verify", "/auth/reset-password/verify"]
  );
}

export async function refresh(refreshToken: string): Promise<string> {
  const response = await api.post("/auth/refresh", { refreshToken });
  return response.data.accessToken as string;
}

export async function me(): Promise<User> {
  const response = await api.get("/me");
  return response.data as User;
}

export async function updateProfile(payload: {
  name: string;
  phone?: string;
  position?: string;
  avatarUrl?: string;
}): Promise<User> {
  const response = await api.put("/me", payload);
  return response.data as User;
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await api.put("/me/password", payload);
}
