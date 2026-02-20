import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "../api/client";
import type { Invoice, User } from "../api/types";
import { me } from "../api/auth";

const schema = z.object({
  number: z.string().min(1),
  customerName: z.string().min(1),
  amount: z.coerce.number().min(0),
  status: z.string().min(1),
  issuedAt: z.string().min(1),
  dueAt: z.string().min(1)
});

type FormValues = z.infer<typeof schema>;

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = () => {
    api
      .get<Invoice[]>("/invoices")
      .then((response) => setInvoices(response.data))
      .catch(() => setError("Could not load invoices"));
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
    setError(null);
    try {
      if (editingInvoice) {
        await api.put(`/invoices/${editingInvoice.id}`, values);
      } else {
        await api.post("/invoices", values);
      }
      reset();
      load();
      setIsModalOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      setError("Create failed");
    }
  };

  const handleAdd = () => {
    setEditingInvoice(null);
    reset({
      number: "",
      customerName: "",
      amount: 0,
      status: "draft",
      issuedAt: "",
      dueAt: ""
    });
    setIsModalOpen(true);
  };

  const toDateInput = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toISOString().slice(0, 10);
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    reset({
      number: invoice.number,
      customerName: invoice.customerName,
      amount: invoice.amount,
      status: invoice.status,
      issuedAt: toDateInput(invoice.issuedAt),
      dueAt: toDateInput(invoice.dueAt)
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (invoice: Invoice) => {
    if (!window.confirm(`Delete invoice ${invoice.number}?`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/invoices/${invoice.id}`);
      load();
    } catch (err) {
      setError("Delete failed");
    }
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || "-";
    }
    return parsed.toLocaleDateString();
  };

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          {error && <span className="error">{error}</span>}
          {role && !["admin", "manager"].includes(role) && (
            <p className="helper">You do not have permission to add invoices.</p>
          )}
        </div>
        {role && ["admin", "manager"].includes(role) && (
          <button className="button" type="button" onClick={handleAdd}>
            Add Invoice
          </button>
        )}
      </div>

      <div className="list-table">
        <div className="list-row list-head">
          <span>Number</span>
          <span>Customer</span>
          <span>Status</span>
          <span>Amount</span>
          <span>Issued</span>
          <span>Due</span>
          <span>Actions</span>
        </div>
        {invoices.length === 0 ? (
          <div className="card">
            <strong>No invoices yet</strong>
            <div className="helper">Click “Add Invoice” to create the first record.</div>
          </div>
        ) : (
          invoices.map((invoice) => (
            <div className="list-row" key={invoice.id}>
              <span>{invoice.number || "-"}</span>
              <span>{invoice.customerName || "-"}</span>
              <span>{invoice.status || "-"}</span>
              <span>{invoice.amount ? invoice.amount.toFixed(2) : "-"}</span>
              <span>{formatDate(invoice.issuedAt)}</span>
              <span>{formatDate(invoice.dueAt)}</span>
              <span>
                {role && ["admin", "manager"].includes(role) && (
                  <>
                    <button className="ghost" type="button" onClick={() => handleEdit(invoice)}>
                      Edit
                    </button>
                    <button className="ghost" type="button" onClick={() => handleDelete(invoice)}>
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingInvoice ? "Edit Invoice" : "Add Invoice"}</h2>
              <button className="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <label>Invoice Number</label>
              <input {...register("number")} />
              {errors.number && <span className="error">Required</span>}

              <label>Customer Name</label>
              <input {...register("customerName")} />
              {errors.customerName && <span className="error">Required</span>}

              <label>Amount</label>
              <input type="number" step="0.01" {...register("amount")} />
              {errors.amount && <span className="error">Required</span>}

              <label>Status</label>
              <select {...register("status")}>
                <option value="draft">draft</option>
                <option value="paid">paid</option>
                <option value="overdue">overdue</option>
              </select>
              {errors.status && <span className="error">Required</span>}

              <label>Issued At</label>
              <input type="date" {...register("issuedAt")} />
              {errors.issuedAt && <span className="error">Required</span>}

              <label>Due At</label>
              <input type="date" {...register("dueAt")} />
              {errors.dueAt && <span className="error">Required</span>}

              <button className="button" type="submit" disabled={isSubmitting}>
                Save Invoice
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}