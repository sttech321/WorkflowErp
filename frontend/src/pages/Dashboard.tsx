import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import type { DashboardMetrics, User } from "../api/types";
import { me } from "../api/auth";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<DashboardMetrics>("/dashboard")
      .then((response) => setMetrics(response.data))
      .catch(() => setError("Could not load dashboard"));
    me().then((data) => setUser(data)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user?.role === "employee") {
      navigate("/attendance", { replace: true });
    }
  }, [user, navigate]);

  return (
    <section className="panel">
      <h1 className="page-title">Dashboard</h1>
      {error && <span className="error">{error}</span>}
      {!metrics ? (
        <p className="helper">Loading metrics...</p>
      ) : (
        <div className="grid">
          <div className="card">
            <strong>Role</strong>
            <div>{user?.role ?? "-"}</div>
          </div>
          <div className="card">
            <strong>Employees</strong>
            <div>{metrics.employees}</div>
          </div>
          <div className="card">
            <strong>Invoices</strong>
            <div>{metrics.invoices}</div>
          </div>
          <div className="card">
            <strong>Revenue</strong>
            <div>
              {metrics.currency} {metrics.revenue.toFixed(2)}
            </div>
          </div>
          <div className="card">
            <strong>Today Attendance</strong>
            <div>{metrics.todayAttendance}</div>
          </div>
        </div>
      )}
    </section>
  );
}
