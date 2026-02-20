import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import api from "./api/client";
import Nav from "./components/Nav";
import TopBar from "./components/TopBar";
import { hasAccessToken } from "./lib/authStorage";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Invoices from "./pages/Invoices";
import Attendance from "./pages/Attendance";
import Leaves from "./pages/Leaves";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

type LogoSettings = {
  expandedLogoUrl: string | null;
  collapsedLogoUrl: string | null;
};

function ProtectedRoute({ children }: { children: JSX.Element }) {
  if (!hasAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const signedIn = hasAccessToken();
  const location = useLocation();
  const isAuthRoute =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/reset-password");

  if (signedIn && !isAuthRoute) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [logos, setLogos] = useState<LogoSettings>(() => {
      const expandedLogo = window.localStorage.getItem("companyLogoUrlExpanded");
      const collapsedLogo = window.localStorage.getItem("companyLogoUrlCollapsed");
      const legacyLogo = window.localStorage.getItem("companyLogoUrl");
      return {
        expandedLogoUrl: expandedLogo || legacyLogo || null,
        collapsedLogoUrl: collapsedLogo || legacyLogo || null
      };
    });

    useEffect(() => {
      const handleLogoUpdate = (event: Event) => {
        const detail = (event as CustomEvent<LogoSettings | string>).detail;
        if (detail === undefined) {
          return;
        }

        const normalized: LogoSettings =
          typeof detail === "string"
            ? {
                expandedLogoUrl: detail || null,
                collapsedLogoUrl: detail || null
              }
            : {
                expandedLogoUrl: detail.expandedLogoUrl || null,
                collapsedLogoUrl: detail.collapsedLogoUrl || null
              };

        setLogos(normalized);
        if (normalized.expandedLogoUrl) {
          window.localStorage.setItem("companyLogoUrlExpanded", normalized.expandedLogoUrl);
          window.localStorage.setItem("companyLogoUrl", normalized.expandedLogoUrl);
        } else {
          window.localStorage.removeItem("companyLogoUrlExpanded");
        }
        if (normalized.collapsedLogoUrl) {
          window.localStorage.setItem("companyLogoUrlCollapsed", normalized.collapsedLogoUrl);
        } else {
          window.localStorage.removeItem("companyLogoUrlCollapsed");
        }
      };

      api
        .get<{ logoUrl: string; expandedLogoUrl?: string; collapsedLogoUrl?: string }>("/settings/logo")
        .then((response) => {
          const expanded = response.data.expandedLogoUrl || response.data.logoUrl || null;
          const collapsed = response.data.collapsedLogoUrl || response.data.logoUrl || null;
          const nextLogos = {
            expandedLogoUrl: expanded,
            collapsedLogoUrl: collapsed
          };
          setLogos(nextLogos);

          if (expanded) {
            window.localStorage.setItem("companyLogoUrlExpanded", expanded);
            window.localStorage.setItem("companyLogoUrl", expanded);
          } else {
            window.localStorage.removeItem("companyLogoUrlExpanded");
          }
          if (collapsed) {
            window.localStorage.setItem("companyLogoUrlCollapsed", collapsed);
          } else {
            window.localStorage.removeItem("companyLogoUrlCollapsed");
          }
        })
        .catch(() => {
          const expandedLogo = window.localStorage.getItem("companyLogoUrlExpanded");
          const collapsedLogo = window.localStorage.getItem("companyLogoUrlCollapsed");
          const legacyLogo = window.localStorage.getItem("companyLogoUrl");
          setLogos({
            expandedLogoUrl: expandedLogo || legacyLogo || null,
            collapsedLogoUrl: collapsedLogo || legacyLogo || null
          });
        });

      window.addEventListener("logo-updated", handleLogoUpdate as EventListener);
      return () => window.removeEventListener("logo-updated", handleLogoUpdate as EventListener);
    }, []);

    const activeLogo = isSidebarCollapsed ? logos.collapsedLogoUrl : logos.expandedLogoUrl;

    return (
      <div className={`app-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <div className="app-top">
          <div className="app-top-brand">
            {activeLogo ? <img src={activeLogo} alt="Company logo" /> : <span>logo</span>}
          </div>
          <TopBar
            onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
          />
        </div>
        <div className="app-body">
          <Nav isCollapsed={isSidebarCollapsed} />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employees"
                element={
                  <ProtectedRoute>
                    <Employees />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ProtectedRoute>
                    <Invoices />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance"
                element={
                  <ProtectedRoute>
                    <Attendance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leaves"
                element={
                  <ProtectedRoute>
                    <Leaves />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leaves/:employeeId"
                element={
                  <ProtectedRoute>
                    <Leaves />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth">
      <main className="app-main auth-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <Employees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <Invoices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <Attendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaves"
            element={
              <ProtectedRoute>
                <Leaves />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaves/:employeeId"
            element={
              <ProtectedRoute>
                <Leaves />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
