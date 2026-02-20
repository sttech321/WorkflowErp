import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { me } from "../api/auth";
import { hasAccessToken } from "../lib/authStorage";
import type { User } from "../api/types";

export default function Nav({ isCollapsed }: { isCollapsed: boolean }) {
  const signedIn = hasAccessToken();
  const [role, setRole] = useState<User["role"] | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setRole(null);
      return;
    }
    me()
      .then((user) => setRole(user.role))
      .catch(() => setRole("employee"));
  }, [signedIn]);

  const renderLink = (to: string, label: string, icon: JSX.Element) => (
    <Link to={to} className="sidebar-link" aria-label={label} title={label}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-text">{label}</span>
    </Link>
  );

  return (
    <aside className={`sidebar${isCollapsed ? " collapsed" : ""}`}>
      <nav className="sidebar-links">
        {signedIn ? (
          role === "employee" ? (
            <>
              {renderLink(
                "/attendance",
                "Attendance",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 4h10v2H7V7zm0 4h6v2H7v-2zm0 4h10v2H7v-2z" />
                </svg>
              )}
              {renderLink(
                "/leaves",
                "Leaves",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5h16v3H4V5zm0 5h16v3H4v-3zm0 5h10v3H4v-3z" />
                </svg>
              )}
            </>
          ) : (
            <>
              {renderLink(
                "/dashboard",
                "Dashboard",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
                </svg>
              )}
              {renderLink(
                "/employees",
                role === "admin" ? "Employees / Managers" : "Employees",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4zM8 14c-2.5 0-5 1.2-5 3.2V20h6v-2c0-1.4.6-2.6 1.6-3.4A7 7 0 0 0 8 14z" />
                </svg>
              )}
              {renderLink(
                "/invoices",
                "Invoices",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1v5h5" />
                </svg>
              )}
              {renderLink(
                "/attendance",
                "Attendance",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 8V4h2v4h4v2h-6V8zm-8 3a9 9 0 1 0 9-9 9 9 0 0 0-9 9zm2 0a7 7 0 1 1 7 7 7 7 0 0 1-7-7z" />
                </svg>
              )}
              {renderLink(
                "/leaves",
                "Leaves",
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2zm-2 7h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z" />
                </svg>
              )}
            </>
          )
        ) : (
          <>
            {renderLink(
              "/login",
              "Login",
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 17l5-5-5-5v10zm-6 3h8v2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8v2H4v16zm10-16h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6v-2h6V6h-6V4z" />
              </svg>
            )}
          </>
        )}
      </nav>
    </aside>
  );
}
