import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { me } from "../api/auth";
import type { User } from "../api/types";
import { clearTokens } from "../lib/authStorage";

export default function TopBar({
  onToggleSidebar
}: {
  onToggleSidebar: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<User>).detail;
      if (detail) {
        setUser(detail);
      }
    };
    me().then((data) => setUser(data)).catch(() => setUser(null));
    window.addEventListener("profile-updated", handleProfileUpdate as EventListener);
    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdate as EventListener);
    };
  }, []);

  const initials = user?.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : "";

  const handleLogout = () => {
    clearTokens();
    navigate("/login");
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button"
          type="button"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
          </svg>
        </button>
      </div>
      <div className="topbar-right">
      <div
        className="profile-menu"
        tabIndex={-1}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        <button
          className="profile-icon"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="profile-ring">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Profile" />
            ) : initials ? (
              <span className="profile-initials">{initials}</span>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5z" />
              </svg>
            )}
          </span>
        </button>
        {isOpen && (
          <div className="profile-dropdown" role="menu">
            <Link className="profile-item" to="/settings" role="menuitem" onClick={() => setIsOpen(false)}>
              Settings
            </Link>
            <Link className="profile-item" to="/profile" role="menuitem" onClick={() => setIsOpen(false)}>
              Profile
            </Link>
            <button className="profile-item danger" type="button" onClick={handleLogout} role="menuitem">
              Log Out
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
