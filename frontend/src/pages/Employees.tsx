import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "../api/client";
import type { Employee, User } from "../api/types";
import { me } from "../api/auth";

const schema = z
  .object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["manager", "employee"]),
  phone: z.string().optional(),
  position: z.string().optional(),
  salary: z.coerce.number().optional(),
    hiredAt: z.string().min(1),
    loginPassword: z.string().min(6).optional().or(z.literal(""))
  });

type FormValues = z.infer<typeof schema>;

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const isAdmin = role === "admin";
  const canManagePeople = role === "admin" || role === "manager";

  const load = () => {
    api
      .get<Employee[]>("/employees")
      .then((response) => setEmployees(response.data))
        .catch(() => setServerError("Could not load employees"));
  };

  useEffect(() => {
    load();
    me()
      .then((user) => {
        setRole(user.role);
        if (user.role === "employee") {
          navigate("/attendance", { replace: true });
        }
      })
      .catch(() => setRole("manager"));
  }, [navigate]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      let nonBlockingError: string | null = null;
      const effectiveRole = isAdmin ? values.role : "employee";
      const { loginPassword, ...rest } = values;
      const employeePayload = { ...rest, role: effectiveRole };
      if (editingEmployee) {
        await api.put(`/employees/${editingEmployee.id}`, employeePayload);
        if (loginPassword) {
          try {
            await api.put(`/employees/${editingEmployee.id}/user/password`, {
              password: loginPassword
            });
          } catch {
            nonBlockingError = "Employee updated, but password update failed.";
          }
        }
      } else {
        const response = await api.post<Employee>("/employees", employeePayload);
        if (loginPassword) {
          try {
            await api.post(`/employees/${response.data.id}/user`, {
              email: values.email,
              password: loginPassword,
              role: effectiveRole
            });
          } catch (err) {
            if (axios.isAxiosError(err)) {
              const status = err.response?.status;
              const message = err.response?.data?.error as string | undefined;
              if (status === 409 && message?.includes("email already")) {
                setError("email", { type: "manual", message: "Email already exists" });
                return;
              }
            }
            nonBlockingError = "Employee saved, but login creation failed.";
          }
        }
      }
      reset();
      load();
      setIsModalOpen(false);
      setEditingEmployee(null);
      if (nonBlockingError) {
        setServerError(nonBlockingError);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error as string | undefined;
        if (status === 409 && message?.includes("email already")) {
          setError("email", { type: "manual", message: "Email already exists" });
          return;
        }
      }
      setServerError("Save failed");
    }
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    reset({
      firstName: "",
      lastName: "",
      email: "",
      role: "employee",
      phone: "",
      position: "",
      salary: undefined,
      hiredAt: "",
      loginPassword: ""
    });
    setShowLoginPassword(false);
    setIsModalOpen(true);
  };

  const toDateInput = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toISOString().slice(0, 10);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    reset({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      role: employee.role ?? "employee",
      phone: employee.phone ?? "",
      position: employee.position ?? "",
      salary: employee.salary ?? undefined,
      hiredAt: toDateInput(employee.hiredAt),
      loginPassword: ""
    });
    setShowLoginPassword(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (employee: Employee) => {
    if (!window.confirm(`Delete ${employee.firstName} ${employee.lastName}?`)) {
      return;
    }
    setServerError(null);
    try {
      await api.delete(`/employees/${employee.id}`);
      load();
    } catch (err) {
      setServerError("Delete failed");
    }
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || "-";
    }
    return parsed.toLocaleDateString();
  };

  const isManagerRole = (employee: Employee) => (employee.role ?? "").toLowerCase() === "manager";
  const managers = employees.filter((employee) => isManagerRole(employee));
  const regularEmployees = employees.filter((employee) => !isManagerRole(employee));

  const pageTitle = isAdmin ? "Employees / Managers" : "Employees";
  const addButtonLabel = isAdmin ? "Add Employee / Manager" : "Add Employee";
  const modalTitle = editingEmployee
    ? isAdmin
      ? "Edit Employee / Manager"
      : "Edit Employee"
    : isAdmin
      ? "Add Employee / Manager"
      : "Add Employee";

  const renderEmployeeSection = (title: string, list: Employee[]) => (
    <div className="list-table employee-section">
      <h2 className="section-title">{title}</h2>
      <div className="list-row list-head employees-row">
        <span>Name</span>
        <span>Email</span>
        <span>Phone</span>
        <span>Position</span>
        <span>Salary</span>
        <span>Joined</span>
        <span>Actions</span>
      </div>
      {list.length === 0 ? (
        <div className="list-row employees-row employee-empty-row">
          <span><strong>No {title.toLowerCase()} yet</strong></span>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : (
        list.map((employee) => (
          <div className="list-row employees-row" key={employee.id}>
            <span>
              {employee.firstName || employee.lastName
                ? `${employee.firstName} ${employee.lastName}`.trim()
                : "-"}
            </span>
            <span>{employee.email || "-"}</span>
            <span>{employee.phone || "-"}</span>
            <span>{employee.position || "-"}</span>
            <span>{employee.salary ? employee.salary.toFixed(2) : "-"}</span>
            <span>{formatDate(employee.hiredAt)}</span>
            <span>
              {role && ["admin", "manager"].includes(role) && (
                <>
                  <button className="ghost" type="button" onClick={() => handleEdit(employee)}>
                    Edit
                  </button>
                  <button className="ghost" type="button" onClick={() => handleDelete(employee)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          {serverError && <span className="error">{serverError}</span>}
          {role && !canManagePeople && (
            <p className="helper">You do not have permission to add employees.</p>
          )}
        </div>
        {canManagePeople && (
          <button className="button" type="button" onClick={handleAdd}>
            {addButtonLabel}
          </button>
        )}
      </div>

      {isAdmin ? (
        <>
          {renderEmployeeSection("Managers", managers)}
          {renderEmployeeSection("Employees", regularEmployees)}
        </>
      ) : (
        renderEmployeeSection("Employees", regularEmployees)
      )}

      {isModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalTitle}</h2>
              <button className="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <label>First Name</label>
              <input {...register("firstName")} />
              {errors.firstName && <span className="error">Required</span>}

              <label>Last Name</label>
              <input {...register("lastName")} />
              {errors.lastName && <span className="error">Required</span>}

              <label>Email</label>
              <input type="email" {...register("email")} />
              {errors.email && <span className="error">{errors.email.message ?? "Valid email required"}</span>}

              {isAdmin && (
                <>
                  <label>Role</label>
                  <select {...register("role")}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                  {errors.role && <span className="error">Role is required</span>}
                </>
              )}

              <label>Phone</label>
              <input {...register("phone")} />

              <label>Position</label>
              <input {...register("position")} />

              <label>Salary</label>
              <input type="number" step="0.01" {...register("salary")} />

              <label>Hired At</label>
              <input type="date" {...register("hiredAt")} />
              {errors.hiredAt && <span className="error">Required</span>}

              <div className="helper">
                {editingEmployee
                  ? "Set a new login password to reset the employee login (leave blank to keep current)."
                  : "Employee login uses the same email (optional)."}
              </div>

              <label>Login Password</label>
              <input
                type={showLoginPassword ? "text" : "password"}
                autoComplete="new-password"
                {...register("loginPassword")}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={showLoginPassword}
                  onChange={(event) => setShowLoginPassword(event.target.checked)}
                />
                Show password
              </label>
              {errors.loginPassword && <span className="error">{errors.loginPassword.message}</span>}

              <button className="button" type="submit" disabled={isSubmitting}>
                Save Employee / Manager
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
