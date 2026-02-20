import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api, { requestWithFallback } from "../api/client";
import type { Employee, LeaveBalance, LeavePolicy, LeaveRequest, User } from "../api/types";
import { me } from "../api/auth";

const schema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["sick", "casual"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

type ReasonModalData = {
  employeeName: string;
  type: string;
  dateRange: string;
  status: string;
  reason: string;
};

const defaultPolicyTotals = {
  sick: 10,
  casual: 7
};

export default function Leaves() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null);
  const [reasonModal, setReasonModal] = useState<ReasonModalData | null>(null);
  const [policyYear, setPolicyYear] = useState(() => new Date().getFullYear().toString());
  const [policyTotals, setPolicyTotals] = useState({
    sick: defaultPolicyTotals.sick.toString(),
    casual: defaultPolicyTotals.casual.toString()
  });
  const [policyFieldErrors, setPolicyFieldErrors] = useState<{ year?: string; sick?: string; casual?: string }>({});
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [isPolicySaving, setIsPolicySaving] = useState(false);
  const { employeeId: routeEmployeeId } = useParams();
  const navigate = useNavigate();

  const resolvedYear = useMemo(() => {
    const parsed = Number(policyYear);
    return Number.isInteger(parsed) ? parsed : new Date().getFullYear();
  }, [policyYear]);

  const isManager = role && ["admin", "manager"].includes(role);
  const isEmployee = role === "employee";

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = () => {
    api
      .get<LeaveRequest[]>("/leave/requests")
      .then((response) => setRequests(response.data))
      .catch(() => setError("Could not load leaves"));

    api
      .get<LeaveBalance[]>(`/leave/balances?year=${resolvedYear}`)
      .then((response) => setBalances(response.data))
      .catch(() => setError("Could not load balances"));

    api
      .get<Employee[]>("/employees")
      .then((response) => setEmployees(response.data))
      .catch(() => setError("Could not load employees"));
  };

  useEffect(() => {
    load();
    me()
      .then((user) => {
        setRole(user.role);
        setCurrentUser(user);
      })
      .catch(() => setRole("manager"));
  }, []);

  useEffect(() => {
    load();
  }, [policyYear]);

  useEffect(() => {
    if (role === "employee" && currentUser?.employeeId) {
      setValue("employeeId", currentUser.employeeId, { shouldValidate: true });
    }
  }, [role, currentUser, setValue]);

  const loadPolicies = async (yearValue: string) => {
    setPolicyError(null);
    try {
      const response = await api.get<LeavePolicy[]>(`/leave/policies?year=${yearValue}`);
      const map = new Map(response.data.map((policy) => [policy.type, policy.total]));
      setPolicyTotals({
        sick: (map.get("sick") ?? defaultPolicyTotals.sick).toString(),
        casual: (map.get("casual") ?? defaultPolicyTotals.casual).toString()
      });
    } catch (err) {
      setPolicyError("Could not load leave policy");
    }
  };

  useEffect(() => {
    if (role && ["admin", "manager"].includes(role)) {
      loadPolicies(policyYear);
    }
  }, [role, policyYear]);

  const activeEmployeeId = useMemo(() => {
    if (role === "employee") {
      return currentUser?.employeeId ?? "";
    }
    return routeEmployeeId ?? "";
  }, [role, currentUser, routeEmployeeId]);

  const filteredRequests = useMemo(() => {
    if (!activeEmployeeId) {
      return [] as LeaveRequest[];
    }
    return requests.filter((request) => {
      if (request.employeeId !== activeEmployeeId) {
        return false;
      }
      const parsed = new Date(request.startDate);
      if (Number.isNaN(parsed.getTime())) {
        return true;
      }
      return parsed.getFullYear() === resolvedYear;
    });
  }, [requests, activeEmployeeId, resolvedYear]);

  const filteredBalances = useMemo(() => {
    if (!activeEmployeeId) {
      return [] as LeaveBalance[];
    }
    return balances.filter((balance) => balance.employeeId === activeEmployeeId);
  }, [balances, activeEmployeeId]);

  const proratedTotal = (policyTotal: number, hiredAt: string, year: number) => {
    const parsed = new Date(hiredAt);
    if (Number.isNaN(parsed.getTime())) {
      return policyTotal;
    }
    if (parsed.getFullYear() < year) {
      return policyTotal;
    }
    if (parsed.getFullYear() > year) {
      return 0;
    }
    let monthsRemaining = 12 - (parsed.getMonth() + 1) + 1;
    if (monthsRemaining < 0) {
      monthsRemaining = 0;
    } else if (monthsRemaining > 12) {
      monthsRemaining = 12;
    }
    const perMonth = policyTotal / 12;
    const total = perMonth * monthsRemaining;
    return Math.round(total * 100) / 100;
  };

  const balanceSummary = useMemo(() => {
    const map = new Map<string, LeaveBalance>();
    filteredBalances.forEach((balance) => map.set(balance.type, balance));
    const employee = employees.find((item) => item.id === activeEmployeeId) ?? null;
    const formatLeaveNumber = (value: number) => Math.floor(value).toString();
    const parts = ["sick", "casual"].map((type) => {
      const data = map.get(type);
      const policyTotal = isManager
        ? Number.isFinite(Number(policyTotals[type as "sick" | "casual"]))
          ? Number(policyTotals[type as "sick" | "casual"])
          : defaultPolicyTotals[type as "sick" | "casual"]
        : defaultPolicyTotals[type as "sick" | "casual"];
      const expectedTotal = employee ? proratedTotal(policyTotal, employee.hiredAt, resolvedYear) : policyTotal;
      const total = data?.total ?? expectedTotal;
      const used = data?.used ?? 0;
      const remaining = total - used;
      return `${type}: ${formatLeaveNumber(total)} total, ${formatLeaveNumber(used)} used, ${formatLeaveNumber(remaining)} left`;
    });
    return parts.join(" | ");
  }, [filteredBalances, employees, activeEmployeeId, resolvedYear, isManager, policyTotals]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      map.set(employee.id, `${employee.firstName} ${employee.lastName}`.trim());
    });
    return map;
  }, [employees]);

  const pendingByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    requests.forEach((request) => {
      if (request.status === "pending") {
        map.set(request.employeeId, (map.get(request.employeeId) ?? 0) + 1);
      }
    });
    return map;
  }, [requests]);

  const toggleEmployee = (id: string) => {
    if (role === "employee") {
      return;
    }
    if (routeEmployeeId === id) {
      navigate("/leaves");
      return;
    }
    navigate(`/leaves/${id}`);
  };

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const payload = {
        ...values,
        employeeId: role === "employee" ? currentUser?.employeeId ?? values.employeeId : values.employeeId
      };
      if (editingRequest) {
        await api.patch(`/leave/requests/${editingRequest.id}`, payload);
      } else {
        await api.post("/leave/requests", payload);
      }
      reset();
      setIsModalOpen(false);
      setEditingRequest(null);
      load();
    } catch (err) {
      setError("Save failed");
    }
  };

  const handleApprove = async (request: LeaveRequest) => {
    setError(null);
    try {
      await requestWithFallback("patch", `/leave/requests/${request.id}/approve`, {}, [
        `/leave/${request.id}/approve`,
        `/leaves/requests/${request.id}/approve`
      ]);
      load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Approve failed");
        return;
      }
      setError("Approve failed");
    }
  };

  const handleReject = async (request: LeaveRequest) => {
    setError(null);
    try {
      await requestWithFallback("patch", `/leave/requests/${request.id}/reject`, {}, [
        `/leave/${request.id}/reject`,
        `/leaves/requests/${request.id}/reject`
      ]);
      load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Reject failed");
        return;
      }
      setError("Reject failed");
    }
  };

  const handlePending = async (request: LeaveRequest) => {
    setError(null);
    try {
      await requestWithFallback("patch", `/leave/requests/${request.id}/pending`, {}, [
        `/leave/${request.id}/pending`,
        `/leaves/requests/${request.id}/pending`
      ]);
      load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Pending update failed");
        return;
      }
      setError("Pending update failed");
    }
  };

  const handleDelete = async (request: LeaveRequest) => {
    if (!window.confirm("Delete this leave request?")) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/leave/requests/${request.id}`);
      load();
    } catch (err) {
      setError("Delete failed");
    }
  };

  const handleEdit = (request: LeaveRequest) => {
    setEditingRequest(request);
    reset({
      employeeId: request.employeeId,
      type: request.type,
      startDate: toDateInput(request.startDate),
      endDate: toDateInput(request.endDate),
      reason: request.reason ?? ""
    });
    setIsModalOpen(true);
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || "-";
    }
    return parsed.toLocaleDateString();
  };

  const toDateInput = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toISOString().slice(0, 10);
  };

  const handlePolicySave = async () => {
    const yearNumber = Number(policyYear);
    const fieldErrors: { year?: string; sick?: string; casual?: string } = {};
    if (!Number.isInteger(yearNumber)) {
      fieldErrors.year = "Year must be a number";
    }

    const sick = Number(policyTotals.sick);
    const casual = Number(policyTotals.casual);
    if (!Number.isFinite(sick)) {
      fieldErrors.sick = "Enter a valid number";
    } else if (sick < 0) {
      fieldErrors.sick = "Cannot be negative";
    }
    if (!Number.isFinite(casual)) {
      fieldErrors.casual = "Enter a valid number";
    } else if (casual < 0) {
      fieldErrors.casual = "Cannot be negative";
    }

    setPolicyFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      setPolicyError("Please fix the highlighted fields");
      return;
    }

    setPolicyError(null);
    setIsPolicySaving(true);
    try {
      await api.put("/leave/policies", {
        year: yearNumber,
        policies: [
          { type: "sick", total: sick },
          { type: "casual", total: casual }
        ]
      });
      load();
    } catch (err) {
      setPolicyError("Save failed");
    } finally {
      setIsPolicySaving(false);
    }
  };

  const openReasonModal = (request: LeaveRequest) => {
    const employeeName = employeeNameById.get(request.employeeId) ?? "Employee";
    const dateRange = `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
    setReasonModal({
      employeeName,
      type: request.type,
      dateRange,
      status: request.status,
      reason: request.reason ?? "-"
    });
  };

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaves</h1>
          {error && <span className="error">{error}</span>}
        </div>
        {role && ["admin", "manager", "employee"].includes(role) && (
          <button className="button" type="button" onClick={() => setIsModalOpen(true)}>
            New Leave
          </button>
        )}
      </div>

      {role && ["admin", "manager"].includes(role) && (
        <div className="card policy-card">
          <div className="policy-header">
            <div>
              <h2 className="section-title">Leave Policy</h2>
              <p className="helper">Set yearly totals for sick and casual leave.</p>
              {policyError && <span className="error">{policyError}</span>}
            </div>
          </div>
          <div className="policy-controls">
            <div>
              <label>Year</label>
              <input
                type="number"
                value={policyYear}
                onChange={(event) => setPolicyYear(event.target.value)}
              />
              {policyFieldErrors.year && <span className="error">{policyFieldErrors.year}</span>}
            </div>
            <div>
              <label>Sick</label>
              <input
                type="number"
                step="0.5"
                value={policyTotals.sick}
                onChange={(event) => setPolicyTotals((current) => ({ ...current, sick: event.target.value }))}
              />
              {policyFieldErrors.sick && <span className="error">{policyFieldErrors.sick}</span>}
            </div>
            <div>
              <label>Casual</label>
              <input
                type="number"
                step="0.5"
                value={policyTotals.casual}
                onChange={(event) => setPolicyTotals((current) => ({ ...current, casual: event.target.value }))}
              />
              {policyFieldErrors.casual && <span className="error">{policyFieldErrors.casual}</span>}
            </div>
            <div className="policy-actions">
              <button className="button" type="button" onClick={handlePolicySave} disabled={isPolicySaving}>
                {isPolicySaving ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="list-table">
        <div className="list-row list-head leaves-employee">
          <span>Employee</span>
          <span>Email</span>
          <span>Position</span>
          <span>Joined</span>
          <span>Leave Status</span>
        </div>
        {employees.length === 0 ? (
          <div className="card">
            <strong>No employees yet</strong>
            <div className="helper">Create employees to manage leaves.</div>
          </div>
        ) : (
          employees.map((employee) => {
            const isSelected = activeEmployeeId === employee.id && activeEmployeeId !== "";
            const pendingCount = pendingByEmployee.get(employee.id) ?? 0;
            const hasPending = pendingCount > 0;
            return (
              <div key={employee.id}>
                <div
                  className={`list-row leaves-employee${role !== "employee" ? " clickable" : ""}${
                    isSelected ? " is-selected" : ""
                  }`}
                  onClick={() => toggleEmployee(employee.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      toggleEmployee(employee.id);
                    }
                  }}
                >
                  <span>
                    {employee.firstName} {employee.lastName}
                  </span>
                  <span>{employee.email}</span>
                  <span>{employee.position || "-"}</span>
                  <span>{formatDate(employee.hiredAt)}</span>
                  <span>
                    <span className={`status-pill ${hasPending ? "status-pending" : "status-out"}`}>
                      {hasPending ? "Pending" : "No pending"}
                    </span>
                  </span>
                </div>
                {isSelected && (
                  <div className="row-expand">
                    <div className="detail-header">
                      <div>
                        <strong>
                          {employee.firstName} {employee.lastName}
                        </strong>
                        <div className="helper">Leave summary: {balanceSummary}</div>
                      </div>
                    </div>
                    <div className="mini-table">
                      <div className="mini-row mini-head leaves-request">
                        <span>Type</span>
                        <span>Start</span>
                        <span>End</span>
                        <span>Days</span>
                        <span>Status</span>
                        <span>Reason</span>
                        <span>Actions</span>
                      </div>
                      {filteredRequests.length === 0 ? (
                        <div className="mini-row leaves-request">
                          <span className="helper">No leave requests yet</span>
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        filteredRequests.map((request) => (
                          <div className="mini-row leaves-request" key={request.id}>
                            <span>{request.type}</span>
                            <span>{formatDate(request.startDate)}</span>
                            <span>{formatDate(request.endDate)}</span>
                            <span>{request.days}</span>
                            <span>
                              <span
                                className={`status-pill ${{
                                  pending: "status-pending",
                                  approved: "status-approved",
                                  rejected: "status-rejected"
                                }[request.status] ?? "status-neutral"}`}
                              >
                                {request.status}
                              </span>
                            </span>
                            <span>
                              {request.reason ? (
                                <div className="reason-cell">
                                  <span className="reason-preview">{request.reason}</span>
                                  <button
                                    className="ghost reason-button"
                                    type="button"
                                    onClick={() => openReasonModal(request)}
                                  >
                                    View
                                  </button>
                                </div>
                              ) : (
                                <span className="helper">-</span>
                              )}
                            </span>
                            <span>
                              {isManager && request.status !== "approved" && (
                                <button className="ghost" type="button" onClick={(event) => { event.stopPropagation(); handleApprove(request); }}>
                                  Approve
                                </button>
                              )}
                              {isManager && request.status !== "rejected" && (
                                <button className="ghost" type="button" onClick={(event) => { event.stopPropagation(); handleReject(request); }}>
                                  Reject
                                </button>
                              )}
                              {isManager && request.status !== "pending" && (
                                <button className="ghost" type="button" onClick={(event) => { event.stopPropagation(); handlePending(request); }}>
                                  Pending
                                </button>
                              )}
                              {isManager && request.status !== "approved" && (
                                <button className="ghost" type="button" onClick={() => handleDelete(request)}>
                                  Delete
                                </button>
                              )}
                              {isEmployee && request.status === "pending" && (
                                <>
                                  <button className="ghost" type="button" onClick={() => handleEdit(request)}>
                                    Edit
                                  </button>
                                  <button className="ghost" type="button" onClick={() => handleDelete(request)}>
                                    Delete
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setIsModalOpen(false);
            setEditingRequest(null);
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRequest ? "Edit Leave" : "New Leave"}</h2>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingRequest(null);
                }}
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              {role === "employee" && <input type="hidden" {...register("employeeId")} />}
              {role !== "employee" && (
                <>
                  <label>Employee</label>
                  <select {...register("employeeId")} defaultValue={activeEmployeeId ?? ""}>
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                      </option>
                    ))}
                  </select>
                  {errors.employeeId && <span className="error">Required</span>}
                </>
              )}

              <label>Type</label>
              <select {...register("type")}>
                <option value="sick">sick</option>
                <option value="casual">casual</option>
              </select>
              {errors.type && <span className="error">Required</span>}

              <label>Start Date</label>
              <input type="date" {...register("startDate")} />
              {errors.startDate && <span className="error">Required</span>}

              <label>End Date</label>
              <input type="date" {...register("endDate")} />
              {errors.endDate && <span className="error">Required</span>}

              <label>Reason</label>
              <textarea rows={3} {...register("reason")} />

              <button className="button" type="submit" disabled={isSubmitting}>
                {editingRequest ? "Update Request" : "Submit Request"}
              </button>
            </form>
          </div>
        </div>
      )}

      {reasonModal && (
        <div className="modal-backdrop" onClick={() => setReasonModal(null)}>
          <div className="modal reason-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Leave Reason</h2>
              <button className="ghost" type="button" onClick={() => setReasonModal(null)}>
                Close
              </button>
            </div>
            <div className="reason-meta">
              <div>
                <span className="helper">Employee</span>
                <div className="reason-value">{reasonModal.employeeName}</div>
              </div>
              <div>
                <span className="helper">Type</span>
                <div className="reason-value">{reasonModal.type}</div>
              </div>
              <div>
                <span className="helper">Dates</span>
                <div className="reason-value">{reasonModal.dateRange}</div>
              </div>
              <div>
                <span className="helper">Status</span>
                <div className="reason-value">{reasonModal.status}</div>
              </div>
            </div>
            <div className="reason-body">
              <p>{reasonModal.reason}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
