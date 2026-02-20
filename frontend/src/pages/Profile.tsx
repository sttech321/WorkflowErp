import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "../api/client";
import type { LeaveBalance, LeavePolicy, LeaveRequest, User } from "../api/types";
import { changePassword, me, updateProfile } from "../api/auth";

const profileSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  position: z.string().optional()
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

type PasswordValues = z.infer<typeof passwordSchema>;

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const currentYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting }
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    me()
      .then((data) => {
        setUser(data);
        setAvatarUrl(data.avatarUrl ?? "");
        reset({
          name: data.name ?? "",
          phone: data.phone ?? "",
          position: data.position ?? ""
        });
      })
      .catch(() => setUser(null));
  }, [reset]);


  useEffect(() => {
    if (!user?.employeeId) {
      setLeaveBalances([]);
      setLeavePolicies([]);
      setLeaveRequests([]);
      return;
    }
    const policiesRequest =
      user.role === "admin" || user.role === "manager"
        ? api.get<LeavePolicy[]>(`/leave/policies?year=${currentYear}`)
        : Promise.resolve({ data: [] as LeavePolicy[] });

    Promise.all([
      api.get<LeaveBalance[]>(`/leave/balances?year=${currentYear}`),
      policiesRequest,
      api.get<LeaveRequest[]>("/leave/requests")
    ])
      .then(([balanceResponse, policyResponse, requestResponse]) => {
        setLeaveBalances(balanceResponse.data.filter((item) => item.employeeId === user.employeeId));
        setLeavePolicies(policyResponse.data);
        setLeaveRequests(
          requestResponse.data.filter((item) => {
            if (item.employeeId !== user.employeeId || item.status !== "approved") {
              return false;
            }
            const parsed = new Date(item.startDate);
            return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === currentYear;
          })
        );
      })
      .catch(() => {
        setLeaveBalances([]);
        setLeavePolicies([]);
        setLeaveRequests([]);
      });
  }, [user, currentYear]);

  const onProfileSubmit = async (values: ProfileValues) => {
    setProfileError(null);
    setProfileMessage(null);
    try {
      const result = await updateProfile({
        name: values.name.trim(),
        phone: values.phone?.trim() || "",
        position: values.position?.trim() || "",
        avatarUrl: avatarUrl || undefined
      });
      setUser(result);
      setAvatarUrl(result.avatarUrl ?? "");
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: result }));
      setProfileMessage("Profile updated");
    } catch (err) {
      setProfileError("Profile update failed");
    }
  };

  const handleAvatarSave = async () => {
    if (!user) {
      return;
    }
    await onProfileSubmit({
      name: user.name ?? "",
      phone: user.phone ?? "",
      position: user.position ?? ""
    });
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAvatarUrl(result);
    };
    reader.readAsDataURL(file);
  };


  const leaveSummary = useMemo(() => {
    const summary = new Map<string, { total: number; used: number; remaining: number }>();

    const policyByType = new Map<string, number>();
    leavePolicies.forEach((policy) => policyByType.set(policy.type, policy.total));

    const approvedUsedByType = new Map<string, number>();
    leaveRequests.forEach((request) => {
      approvedUsedByType.set(request.type, (approvedUsedByType.get(request.type) ?? 0) + request.days);
    });

    ["sick", "casual"].forEach((type) => {
      const policyTotal = policyByType.get(type) ?? (type === "sick" ? 10 : 7);
      const used = approvedUsedByType.get(type) ?? 0;
      summary.set(type, {
        total: policyTotal,
        used,
        remaining: Math.max(0, policyTotal - used)
      });
    });

    leaveBalances.forEach((balance) => {
      summary.set(balance.type, {
        total: balance.total,
        used: balance.used,
        remaining: Math.max(0, balance.total - balance.used)
      });
    });

    return summary;
  }, [leaveBalances, leavePolicies, leaveRequests]);

  const formatLeave = (value: number) => {
    return String(Math.max(0, Math.floor(value)));
  };

  const isEmployee = user?.role === "employee";

  const onPasswordSubmit = async (values: PasswordValues) => {
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      await changePassword(values);
      resetPassword({ currentPassword: "", newPassword: "" });
      setPasswordMessage("Password updated");
    } catch (err) {
      setPasswordError("Password update failed");
    }
  };

  return (
    <section className="panel">
      <h1 className="page-title">Profile</h1>

      <div className="grid profile-grid">
        <div className="card">
          <h2 className="section-title">Profile Details</h2>
          {profileError && <span className="error">{profileError}</span>}
          {profileMessage && <span className="helper">{profileMessage}</span>}

          <div className="profile-avatar">
            <div className="avatar-ring">
              {avatarUrl ? <img src={avatarUrl} alt="Profile" /> : <span>+</span>}
            </div>
            <div className="avatar-actions">
              <label className="ghost" htmlFor="avatar-upload">
                Upload Photo
              </label>
              <input
                id="avatar-upload"
                className="file-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
              />
              <button className="button" type="button" onClick={handleAvatarSave}>
                Save Photo
              </button>
            </div>
          </div>

          {isEmployee ? (
            <div className="profile-readonly">
              <div className="detail-row">
                <span>Full Name</span>
                <span>{user?.name ?? "-"}</span>
              </div>
              <div className="detail-row">
                <span>Email</span>
                <span>{user?.email ?? "-"}</span>
              </div>
              <div className="detail-row">
                <span>Phone</span>
                <span>{user?.phone ?? "-"}</span>
              </div>
              <div className="detail-row">
                <span>Position</span>
                <span>{user?.position ?? "-"}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onProfileSubmit)}>
              <label>Full Name</label>
              <input {...register("name")} />
              {errors.name && <span className="error">Enter your name</span>}

              <label>Email</label>
              <input value={user?.email ?? ""} disabled />

              {user?.employeeId && (
                <>
                  <label>Phone</label>
                  <input {...register("phone")} />

                  <label>Position</label>
                  <input {...register("position")} />
                </>
              )}

              <button className="button" type="submit" disabled={isSubmitting}>
                Save Profile
              </button>
            </form>
          )}
        </div>

        {user?.employeeId && (
          <div className="card">
            <h2 className="section-title">Leave Balance ({currentYear})</h2>
            <div className="detail-row">
              <span>Sick</span>
              <span>
                {formatLeave(leaveSummary.get("sick")?.total ?? 0)} total | {formatLeave(leaveSummary.get("sick")?.used ?? 0)} used | {formatLeave(leaveSummary.get("sick")?.remaining ?? 0)} remaining
              </span>
            </div>
            <div className="detail-row">
              <span>Casual</span>
              <span>
                {formatLeave(leaveSummary.get("casual")?.total ?? 0)} total | {formatLeave(leaveSummary.get("casual")?.used ?? 0)} used | {formatLeave(leaveSummary.get("casual")?.remaining ?? 0)} remaining
              </span>
            </div>
          </div>
        )}


        {!isEmployee && (
          <div className="card">
            <h2 className="section-title">Change Password</h2>
            {passwordError && <span className="error">{passwordError}</span>}
            {passwordMessage && <span className="helper">{passwordMessage}</span>}
            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
              <label>Current Password</label>
              <input type="password" {...registerPassword("currentPassword")} />
              {passwordErrors.currentPassword && <span className="error">Required</span>}

              <label>New Password</label>
              <input type="password" {...registerPassword("newPassword")} />
              {passwordErrors.newPassword && <span className="error">Minimum 8 characters</span>}

              <button className="button" type="submit" disabled={isPasswordSubmitting}>
                Update Password
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
