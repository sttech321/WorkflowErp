import { ChangeEvent, useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { me } from "../api/auth";
import type { User } from "../api/types";

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [expandedLogoUrl, setExpandedLogoUrl] = useState<string | null>(null);
  const [collapsedLogoUrl, setCollapsedLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    me().then((data) => setUser(data)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    api
      .get<{ logoUrl: string; expandedLogoUrl?: string; collapsedLogoUrl?: string }>("/settings/logo")
      .then((response) => {
        const expanded = response.data.expandedLogoUrl || response.data.logoUrl || null;
        const collapsed = response.data.collapsedLogoUrl || response.data.logoUrl || null;
        setExpandedLogoUrl(expanded);
        setCollapsedLogoUrl(collapsed);
      })
      .catch(() => {
        setExpandedLogoUrl(null);
        setCollapsedLogoUrl(null);
      });
  }, []);

  const canUpdateLogo = user?.role === "admin" || user?.role === "manager";

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>, variant: "expanded" | "collapsed") => {
    if (!canUpdateLogo) {
      setError("Only admin or manager can update the logo.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        return;
      }
      setError(null);
      setMessage(null);
      api
        .put<{ logoUrl: string; expandedLogoUrl: string; collapsedLogoUrl: string }>("/settings/logo", {
          expandedLogoUrl: variant === "expanded" ? result : expandedLogoUrl ?? "",
          collapsedLogoUrl: variant === "collapsed" ? result : collapsedLogoUrl ?? ""
        })
        .then((response) => {
          setExpandedLogoUrl(response.data.expandedLogoUrl || null);
          setCollapsedLogoUrl(response.data.collapsedLogoUrl || null);
          window.dispatchEvent(
            new CustomEvent("logo-updated", {
              detail: {
                expandedLogoUrl: response.data.expandedLogoUrl || null,
                collapsedLogoUrl: response.data.collapsedLogoUrl || null
              }
            })
          );
          setMessage("Logo updated");
        })
        .catch((err) => {
          if (axios.isAxiosError(err)) {
            const apiMessage = err.response?.data?.error as string | undefined;
            if (apiMessage) {
              setError(apiMessage);
              return;
            }
          }
          setError("Logo update failed");
        });
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="panel">
      <h1 className="page-title">Settings</h1>
      <div className="grid">
        <div className="card">
          <h2 className="section-title">Company Logos</h2>
          {error && <span className="error">{error}</span>}
          {message && <span className="helper">{message}</span>}
          <div className="logo-uploader dual">
            <div className="logo-block">
              <div className="helper">Sidebar expanded (icon + text)</div>
              <div className="logo-preview">
                {expandedLogoUrl ? <img src={expandedLogoUrl} alt="Expanded company logo" /> : <span>WF</span>}
              </div>
              <label className="ghost" htmlFor="logo-upload-expanded">
                Upload Expanded Logo
              </label>
              <input
                id="logo-upload-expanded"
                className="file-input"
                type="file"
                accept="image/*"
                onChange={(event) => handleLogoChange(event, "expanded")}
                disabled={!canUpdateLogo}
              />
            </div>

            <div className="logo-block">
              <div className="helper">Sidebar collapsed (icon only)</div>
              <div className="logo-preview">
                {collapsedLogoUrl ? <img src={collapsedLogoUrl} alt="Collapsed company logo" /> : <span>WF</span>}
              </div>
              <label className="ghost" htmlFor="logo-upload-collapsed">
                Upload Collapsed Logo
              </label>
              <input
                id="logo-upload-collapsed"
                className="file-input"
                type="file"
                accept="image/*"
                onChange={(event) => handleLogoChange(event, "collapsed")}
                disabled={!canUpdateLogo}
              />
            </div>
          </div>
          {!canUpdateLogo && <p className="helper">Only admin or manager can update logos.</p>}
        </div>
      </div>
    </section>
  );
}
