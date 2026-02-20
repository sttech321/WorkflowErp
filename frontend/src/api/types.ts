export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "employee";
  employeeId?: string;
  phone?: string;
  position?: string;
  avatarUrl?: string;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
};

export type DashboardMetrics = {
  employees: number;
  invoices: number;
  revenue: number;
  todayAttendance: number;
  currency: string;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "manager" | "employee";
  phone?: string;
  position?: string;
  salary?: number;
  hiredAt: string;
};

export type Invoice = {
  id: string;
  number: string;
  customerName: string;
  amount: number;
  status: string;
  issuedAt: string;
  dueAt: string;
};

export type Attendance = {
  id: string;
  employeeId: string;
  checkIn: string;
  checkOut?: string;
  breaks?: AttendanceBreak[];
};

export type AttendanceBreak = {
  id: string;
  attendanceId: string;
  breakStart: string;
  breakEnd?: string;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  type: "sick" | "casual";
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  approverId?: string;
  approvedAt?: string;
  createdAt: string;
};

export type LeaveBalance = {
  id: string;
  employeeId: string;
  year: number;
  type: "sick" | "casual";
  total: number;
  used: number;
};

export type LeavePolicy = {
  id: string;
  year: number;
  type: "sick" | "casual";
  total: number;
};
