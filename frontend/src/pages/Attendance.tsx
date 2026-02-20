import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import api, { requestWithFallback } from "../api/client";
import type { Attendance, AttendanceBreak, Employee, User } from "../api/types";
import { me } from "../api/auth";

function getCurrentTimeParts() {
  const now = new Date();
  const hour24 = now.getHours();
  const minute = now.getMinutes();
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    time: `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    period
  };
}

function getOffsetTimeParts(minutesToAdd: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesToAdd);
  const hour24 = date.getHours();
  const minute = date.getMinutes();
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    time: `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    period
  };
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalDateKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return formatDateKey(parsed);
}

function formatDateLabel(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

export default function Attendance() {
  const todayDate = formatDateKey(new Date());
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [manualAttendanceId, setManualAttendanceId] = useState("");
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState(todayDate);
  const [filterEndDate, setFilterEndDate] = useState(todayDate);
  const [selectedDateByEmployee, setSelectedDateByEmployee] = useState<Record<string, string>>({});
  const [manualCheckInTime, setManualCheckInTime] = useState(() => getCurrentTimeParts().time);
  const [manualCheckInPeriod, setManualCheckInPeriod] = useState<"AM" | "PM">(() => getCurrentTimeParts().period);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [manualBreakStartTime, setManualBreakStartTime] = useState(() => getCurrentTimeParts().time);
  const [manualBreakStartPeriod, setManualBreakStartPeriod] = useState<"AM" | "PM">(() => getCurrentTimeParts().period);
  const [manualBreakEndTime, setManualBreakEndTime] = useState(() => getOffsetTimeParts(15).time);
  const [manualBreakEndPeriod, setManualBreakEndPeriod] = useState<"AM" | "PM">(() => getOffsetTimeParts(15).period);
  const [manualCheckOutTime, setManualCheckOutTime] = useState(() => getCurrentTimeParts().time);
  const [manualCheckOutPeriod, setManualCheckOutPeriod] = useState<"AM" | "PM">(() => getCurrentTimeParts().period);

  const isManagerView = role === "admin" || role === "manager";

  const loadAttendance = () => {
    api
      .get<Attendance[]>("/attendance")
      .then((response) => setAttendance(response.data))
      .catch(() => setError("Could not load attendance"));
  };

  const loadEmployees = () => {
    api
      .get<Employee[]>("/employees")
      .then((response) => setEmployees(response.data))
      .catch(() => setError("Could not load employees"));
  };

  useEffect(() => {
    loadAttendance();
    loadEmployees();
    me()
      .then((user) => {
        setRole(user.role);
        setCurrentUser(user);
      })
      .catch(() => setRole("manager"));
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const openAttendance = useMemo(() => attendance.filter((record) => !record.checkOut), [attendance]);

  const selfEmployeeId = useMemo(() => currentUser?.employeeId ?? "", [currentUser]);

  const selfOpenAttendance = useMemo(
    () => (selfEmployeeId ? openAttendance.find((record) => record.employeeId === selfEmployeeId) ?? null : null),
    [openAttendance, selfEmployeeId]
  );

  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    attendance.forEach((record) => {
      const list = map.get(record.employeeId) ?? [];
      list.push(record);
      map.set(record.employeeId, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()));
    return map;
  }, [attendance]);

  const filteredAttendance = useMemo(() => {
    const start = filterStartDate <= filterEndDate ? filterStartDate : filterEndDate;
    const end = filterStartDate <= filterEndDate ? filterEndDate : filterStartDate;
    return attendance.filter((record) => {
      if (filterEmployeeId && record.employeeId !== filterEmployeeId) {
        return false;
      }
      const recordDate = getLocalDateKey(record.checkIn);
      if (!recordDate) {
        return false;
      }
      return recordDate >= start && recordDate <= end;
    });
  }, [attendance, filterEmployeeId, filterStartDate, filterEndDate]);

  const filteredAttendanceByEmployee = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    filteredAttendance.forEach((record) => {
      const list = map.get(record.employeeId) ?? [];
      list.push(record);
      map.set(record.employeeId, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()));
    return map;
  }, [filteredAttendance]);

  const employeeDisplayById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: "manager" | "employee" }>();
    employees.forEach((employee) => {
      map.set(employee.id, {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        role: employee.role
      });
    });
    if (selfEmployeeId && currentUser && !map.has(selfEmployeeId)) {
      map.set(selfEmployeeId, {
        id: selfEmployeeId,
        name: currentUser.name || "My Account",
        role: currentUser.role === "manager" ? "manager" : "employee"
      });
    }
    return map;
  }, [employees, selfEmployeeId, currentUser]);

  const visibleEmployeeRows = useMemo(() => {
    const employeeIds = Array.from(filteredAttendanceByEmployee.keys());
    const rows = employeeIds.map((employeeId) => {
      const display = employeeDisplayById.get(employeeId);
      return {
        id: employeeId,
        name: display?.name || `Employee ${employeeId.slice(0, 8)}`,
        role: display?.role || "employee"
      };
    });

    return rows.sort((left, right) => {
      const leftLatest = filteredAttendanceByEmployee.get(left.id)?.[0];
      const rightLatest = filteredAttendanceByEmployee.get(right.id)?.[0];
      const leftTime = leftLatest ? new Date(leftLatest.checkIn).getTime() : 0;
      const rightTime = rightLatest ? new Date(rightLatest.checkIn).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [filteredAttendanceByEmployee, employeeDisplayById]);


  const manualOpenAttendance = useMemo(
    () =>
      openAttendance.filter((record) => {
        if (!manualEmployeeId) {
          return true;
        }
        return record.employeeId === manualEmployeeId;
      }),
    [openAttendance, manualEmployeeId]
  );

  const selectedManualAttendance = useMemo(
    () => manualOpenAttendance.find((record) => record.id === manualAttendanceId) ?? null,
    [manualOpenAttendance, manualAttendanceId]
  );

  const parseManualTime = (timeValue: string, period: "AM" | "PM") => {
    const trimmed = timeValue.trim();
    const match = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])$/);
    if (!match) {
      throw new Error("Enter time as hh:mm (example: 09:30)");
    }
    const hour12 = Number(match[1]);
    const minutes = Number(match[2]);
    let hour24 = hour12 % 12;
    if (period === "PM") {
      hour24 += 12;
    }
    return { hour24, minutes };
  };

  const buildManualBreakDateTime = (anchorIso: string, timeValue: string, period: "AM" | "PM") => {
    const anchor = new Date(anchorIso);
    if (Number.isNaN(anchor.getTime())) {
      throw new Error("Invalid attendance time");
    }
    const { hour24, minutes } = parseManualTime(timeValue, period);
    const year = anchor.getFullYear();
    const month = String(anchor.getMonth() + 1).padStart(2, "0");
    const day = String(anchor.getDate()).padStart(2, "0");
    const hour = String(hour24).padStart(2, "0");
    const minute = String(minutes).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  };

  const getManualBreakAnchor = () => {
    if (selectedManualAttendance) {
      return selectedManualAttendance.checkIn;
    }
    if (manualEmployeeId) {
      const latestForEmployee = attendanceByEmployee.get(manualEmployeeId)?.[0];
      if (latestForEmployee) {
        return latestForEmployee.checkIn;
      }
    }
    return new Date().toISOString();
  };

  const buildTimeOnDate = (baseDateIso: string, timeValue: string, period: "AM" | "PM") => {
    return buildManualBreakDateTime(baseDateIso, timeValue, period);
  };

  const handleTimeInputChange = (value: string, setter: (next: string) => void) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      setter(digits);
      return;
    }
    setter(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  };

  const handleManagerOwnCheckIn = async () => {
    if (!isManagerView) {
      return;
    }
    if (!selfEmployeeId) {
      setError("Your employee profile is not linked");
      return;
    }
    setError(null);
    try {
      await api.post("/attendance/checkin", { employeeId: selfEmployeeId });
      loadAttendance();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Check-in failed");
        return;
      }
      setError("Check-in failed");
    }
  };

  const handleManagerOwnCheckOut = async () => {
    if (!isManagerView) {
      return;
    }
    if (!selfEmployeeId) {
      setError("Your employee profile is not linked");
      return;
    }
    setError(null);
    try {
      if (!selfOpenAttendance) {
        setError("No active attendance to check out");
        return;
      }
      await api.post("/attendance/checkout", { attendanceId: selfOpenAttendance.id });
      loadAttendance();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Check-out failed");
        return;
      }
      setError("Check-out failed");
    }
  };

  const handleManagerOwnBreakStart = async () => {
    if (!isManagerView) {
      return;
    }
    if (!selfEmployeeId) {
      setError("Your employee profile is not linked");
      return;
    }
    setError(null);
    try {
      await requestWithFallback("post", "/attendance/break/start", { employeeId: selfEmployeeId }, [
        "/attendance/start",
        "/attendance/breaks/start"
      ]);
      loadAttendance();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Break start failed");
        return;
      }
      setError("Break start failed");
    }
  };

  const handleManagerOwnBreakEnd = async () => {
    if (!isManagerView) {
      return;
    }
    if (!selfEmployeeId) {
      setError("Your employee profile is not linked");
      return;
    }
    setError(null);
    try {
      await requestWithFallback("post", "/attendance/break/end", { employeeId: selfEmployeeId }, [
        "/attendance/end",
        "/attendance/breaks/end"
      ]);
      loadAttendance();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Break end failed");
        return;
      }
      setError("Break end failed");
    }
  };

  const handleManualEmployeeCheckIn = async () => {
    if (!isManagerView) {
      return;
    }
    setError(null);
    if (!manualEmployeeId) {
      setError("Select employee for manual check-in");
      return;
    }
    try {
      const payload: { employeeId: string; checkInAt?: string } = { employeeId: manualEmployeeId };
      const currentTime = getCurrentTimeParts();
      const resolvedTime = manualCheckInTime || currentTime.time;
      const resolvedPeriod = manualCheckInTime ? manualCheckInPeriod : currentTime.period;
      const checkInAt = buildTimeOnDate(new Date().toISOString(), resolvedTime, resolvedPeriod);
      payload.checkInAt = checkInAt;

      await api.post("/attendance/checkin", payload);
      const nowParts = getCurrentTimeParts();
      setManualCheckInTime(nowParts.time);
      setManualCheckInPeriod(nowParts.period);
      loadAttendance();
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
        return;
      }
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Manual check-in failed");
        return;
      }
      setError("Manual check-in failed");
    }
  };

  const handleManualBreakAdd = async () => {
    if (!isManagerView) {
      return;
    }
    setError(null);
    if (!manualAttendanceId) {
      setError("Select active attendance for manual break");
      return;
    }
    try {
      const anchor = selectedManualAttendance?.checkIn ?? getManualBreakAnchor();
      const nowParts = getCurrentTimeParts();
      const plusParts = getOffsetTimeParts(15);
      const resolvedBreakStartTime = manualBreakStartTime || nowParts.time;
      const resolvedBreakStartPeriod = manualBreakStartTime ? manualBreakStartPeriod : nowParts.period;
      const resolvedBreakEndTime = manualBreakEndTime || plusParts.time;
      const resolvedBreakEndPeriod = manualBreakEndTime ? manualBreakEndPeriod : plusParts.period;

      const breakStartAt = buildManualBreakDateTime(anchor, resolvedBreakStartTime, resolvedBreakStartPeriod);
      const breakEndAt = buildManualBreakDateTime(anchor, resolvedBreakEndTime, resolvedBreakEndPeriod);

      await requestWithFallback(
        "post",
        "/attendance/break/manual",
        {
          attendanceId: manualAttendanceId,
          breakStartAt,
          breakEndAt
        },
        ["/attendance/manual", "/attendance/manual-break", "/attendance/breaks/manual"]
      );
      const nextStart = getCurrentTimeParts();
      const nextEnd = getOffsetTimeParts(15);
      setManualBreakStartTime(nextStart.time);
      setManualBreakStartPeriod(nextStart.period);
      setManualBreakEndTime(nextEnd.time);
      setManualBreakEndPeriod(nextEnd.period);
      loadAttendance();
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
        return;
      }
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Manual break add failed");
        return;
      }
      setError("Manual break add failed");
    }
  };

  const handleManualEmployeeCheckOut = async () => {
    if (!isManagerView) {
      return;
    }
    setError(null);
    if (!manualAttendanceId) {
      setError("Select active attendance for check-out");
      return;
    }
    try {
      const anchor = selectedManualAttendance?.checkIn ?? getManualBreakAnchor();
      const nowParts = getCurrentTimeParts();
      const resolvedCheckOutTime = manualCheckOutTime || nowParts.time;
      const resolvedCheckOutPeriod = manualCheckOutTime ? manualCheckOutPeriod : nowParts.period;
      const checkOutAt = buildManualBreakDateTime(anchor, resolvedCheckOutTime, resolvedCheckOutPeriod);

      await api.post("/attendance/checkout", { attendanceId: manualAttendanceId, checkOutAt });
      setManualAttendanceId("");
      const nextTime = getCurrentTimeParts();
      setManualCheckOutTime(nextTime.time);
      setManualCheckOutPeriod(nextTime.period);
      loadAttendance();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.error as string | undefined;
        setError(message || "Manual check-out failed");
        return;
      }
      setError("Manual check-out failed");
    }
  };

  const handleEmployeeCheckIn = async () => {
    setError(null);
    try {
      await api.post("/attendance/checkin", {});
      loadAttendance();
    } catch {
      setError("Check-in failed");
    }
  };

  const handleEmployeeCheckOut = async () => {
    setError(null);
    try {
      await api.post("/attendance/checkout", {});
      loadAttendance();
    } catch {
      setError("Check-out failed");
    }
  };

  const handleEmployeeBreakStart = async () => {
    setError(null);
    try {
      await requestWithFallback("post", "/attendance/break/start", {}, ["/attendance/start", "/attendance/breaks/start"]);
      loadAttendance();
    } catch {
      setError("Break start failed");
    }
  };

  const handleEmployeeBreakEnd = async () => {
    setError(null);
    try {
      await requestWithFallback("post", "/attendance/break/end", {}, ["/attendance/end", "/attendance/breaks/end"]);
      loadAttendance();
    } catch {
      setError("Break end failed");
    }
  };

  const handleDelete = async (record: Attendance) => {
    if (!window.confirm("Delete this attendance record?")) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/attendance/${record.id}`);
      loadAttendance();
    } catch {
      setError("Delete failed");
    }
  };

  const formatDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || "-";
    }
    return parsed.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  };

  const breakDurationMs = (breaks?: AttendanceBreak[]) => {
    if (!breaks || breaks.length === 0) {
      return 0;
    }
    return breaks.reduce((total, item) => {
      const start = new Date(item.breakStart).getTime();
      const end = new Date(item.breakEnd ?? new Date().toISOString()).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return total;
      }
      return total + (end - start);
    }, 0);
  };

  const formatHours = (record: Attendance) => {
    if (!record.checkOut) {
      return "-";
    }
    const start = new Date(record.checkIn).getTime();
    const end = new Date(record.checkOut).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return "-";
    }
    const workMs = end - start - breakDurationMs(record.breaks);
    const hours = Math.max(0, workMs) / (1000 * 60 * 60);
    return hours.toFixed(2);
  };

  const formatBreakHours = (record: Attendance) => {
    const hours = breakDurationMs(record.breaks) / (1000 * 60 * 60);
    return hours.toFixed(2);
  };

  const formatDuration = (startIso: string, endIso?: string) => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso ?? new Date().toISOString()).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return "-";
    }
    const totalMinutes = Math.floor((end - start) / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const formatHoursMinutesFromMs = (ms: number) => {
    const safeMs = Math.max(0, ms);
    const totalMinutes = Math.floor(safeMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const workDurationMs = (record: Attendance) => {
    if (!record.checkOut) {
      return 0;
    }
    const start = new Date(record.checkIn).getTime();
    const end = new Date(record.checkOut).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return 0;
    }
    return Math.max(0, end - start - breakDurationMs(record.breaks));
  };

  const totalHours = (records: Attendance[]) =>
    records.reduce((total, record) => {
      if (!record.checkOut) {
        return total;
      }
      const start = new Date(record.checkIn).getTime();
      const end = new Date(record.checkOut).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return total;
      }
      const workMs = end - start - breakDurationMs(record.breaks);
      return total + Math.max(0, workMs) / (1000 * 60 * 60);
    }, 0);

  const totalBreakHours = (records: Attendance[]) =>
    records.reduce((total, record) => total + breakDurationMs(record.breaks) / (1000 * 60 * 60), 0);

  const totalWorkMs = (records: Attendance[]) => records.reduce((total, record) => total + workDurationMs(record), 0);
  const totalBreakMs = (records: Attendance[]) => records.reduce((total, record) => total + breakDurationMs(record.breaks), 0);

  const activeAttendanceRecord = selfOpenAttendance;
  const activeBreak = activeAttendanceRecord?.breaks?.find((item) => !item.breakEnd) ?? null;
  const hasSelfCheckInToday = useMemo(() => {
    if (!selfEmployeeId) {
      return false;
    }
    return attendance.some((record) => record.employeeId === selfEmployeeId && getLocalDateKey(record.checkIn) === todayDate);
  }, [attendance, selfEmployeeId, todayDate]);

  return (
    <section className="panel">
      <h1 className="page-title">Attendance</h1>
      {error && <span className="error">{error}</span>}

      {isManagerView ? (
        <div className="attendance-manager-sections">
          <div className="card attendance-card">
            <label className="section-label">{currentUser?.name || "Manager"}</label>
            <div className="helper">
              Break status: {activeBreak ? `On break since ${formatDateTime(activeBreak.breakStart)}` : "No active break"}
            </div>
            <div className="pill-group">
              <button className="button" type="button" onClick={handleManagerOwnCheckIn} disabled={hasSelfCheckInToday}>
                Check In
              </button>
              <button className="ghost" type="button" onClick={handleManagerOwnBreakStart} disabled={!activeAttendanceRecord}>
                Start Break
              </button>
              <button className="ghost" type="button" onClick={handleManagerOwnBreakEnd} disabled={!activeAttendanceRecord || !activeBreak}>
                End Break
              </button>
              <button className="button" type="button" onClick={handleManagerOwnCheckOut} disabled={!activeAttendanceRecord}>
                Check Out
              </button>
            </div>
            {hasSelfCheckInToday && <div className="helper">You already checked in today. Check-in is disabled for today.</div>}
            {!activeAttendanceRecord && hasSelfCheckInToday && (
              <div className="helper">No active attendance is open for check-out.</div>
            )}
          </div>

          <div className="card attendance-card">
            <label className="section-label">Employee Manual Entry</label>
            <select value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)}>
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>

            <div className="manual-break-block">
              <label>Manual Check In Time</label>
              <div className="manual-checkin-grid">
                <input
                  type="text"
                  placeholder="hh:mm"
                  inputMode="numeric"
                  value={manualCheckInTime}
                  onChange={(event) => handleTimeInputChange(event.target.value, setManualCheckInTime)}
                />
                <select
                  value={manualCheckInPeriod}
                  onChange={(event) => setManualCheckInPeriod(event.target.value as "AM" | "PM")}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <button className="button" type="button" onClick={handleManualEmployeeCheckIn}>
                  Add Check In
                </button>
              </div>
            </div>

            <div className="manual-break-block">
              <label>Manual Check Out</label>
              <div className="manual-checkin-grid">
                <input
                  type="text"
                  placeholder="hh:mm"
                  inputMode="numeric"
                  value={manualCheckOutTime}
                  onChange={(event) => handleTimeInputChange(event.target.value, setManualCheckOutTime)}
                />
                <select
                  value={manualCheckOutPeriod}
                  onChange={(event) => setManualCheckOutPeriod(event.target.value as "AM" | "PM")}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <button className="button" type="button" onClick={handleManualEmployeeCheckOut}>
                  Add Check Out
                </button>
              </div>
            </div>

            <div className="manual-break-block">
              <label>Manual Break Entry</label>
              <select value={manualAttendanceId} onChange={(event) => setManualAttendanceId(event.target.value)}>
                <option value="">Select active attendance</option>
                {manualOpenAttendance.map((record) => {
                  const employee = employeeById.get(record.employeeId);
                  if (!employee) return null;
                  return (
                    <option key={record.id} value={record.id}>
                      {employee.firstName} {employee.lastName} · {formatDateTime(record.checkIn)}
                    </option>
                  );
                })}
              </select>
              <div className="manual-break-grid">
                <div className="manual-time-row">
                  <input
                    type="text"
                    placeholder="hh:mm"
                    inputMode="numeric"
                    value={manualBreakStartTime}
                    onChange={(event) => handleTimeInputChange(event.target.value, setManualBreakStartTime)}
                  />
                  <select
                    value={manualBreakStartPeriod}
                    onChange={(event) => setManualBreakStartPeriod(event.target.value as "AM" | "PM")}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <div className="manual-time-row">
                  <input
                    type="text"
                    placeholder="hh:mm"
                    inputMode="numeric"
                    value={manualBreakEndTime}
                    onChange={(event) => handleTimeInputChange(event.target.value, setManualBreakEndTime)}
                  />
                  <select
                    value={manualBreakEndPeriod}
                    onChange={(event) => setManualBreakEndPeriod(event.target.value as "AM" | "PM")}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <button className="ghost" type="button" onClick={handleManualBreakAdd}>
                  Add Break
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid attendance-grid">
          <div className="card attendance-card">
            <label className="section-label">My Shift</label>
            <div className="helper">{currentUser?.name ? `Signed in as ${currentUser.name}` : "Signed in"}</div>
            <div className="helper">
              Break status: {activeBreak ? `On break since ${formatDateTime(activeBreak.breakStart)}` : "No active break"}
            </div>
            <div className="pill-group">
              <button className="button" type="button" onClick={handleEmployeeCheckIn} disabled={hasSelfCheckInToday}>
                Check In
              </button>
              <button className="ghost" type="button" onClick={handleEmployeeBreakStart}>
                Start Break
              </button>
              <button className="ghost" type="button" onClick={handleEmployeeBreakEnd}>
                End Break
              </button>
              <button className="button" type="button" onClick={handleEmployeeCheckOut}>
                Check Out
              </button>
            </div>
            {hasSelfCheckInToday && <div className="helper">You already checked in today. Check-in is disabled for today.</div>}
          </div>
        </div>
      )}

      {isManagerView && (
        <div className="card attendance-filter-card">
          <div className="attendance-filter-grid">
            <div>
              <label>Employee</label>
              <select value={filterEmployeeId} onChange={(event) => setFilterEmployeeId(event.target.value)}>
                <option value="">All employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Start Date</label>
              <input type="date" value={filterStartDate} onChange={(event) => setFilterStartDate(event.target.value)} />
            </div>
            <div>
              <label>End Date</label>
              <input type="date" value={filterEndDate} onChange={(event) => setFilterEndDate(event.target.value)} />
            </div>
          </div>
          <div className="helper">
            Showing attendance from {formatDateLabel(filterStartDate <= filterEndDate ? filterStartDate : filterEndDate)} to {" "}
            {formatDateLabel(filterStartDate <= filterEndDate ? filterEndDate : filterStartDate)}
          </div>
        </div>
      )}

      <div className="list-table">
        <div className="list-row list-head attendance-summary">
          <span>Employee</span>
          <span>Status</span>
          <span>Last Check In</span>
          <span>Last Check Out</span>
          <span>Work Hours</span>
          <span>Break Hours</span>
        </div>
        {visibleEmployeeRows.length === 0 && (
          <div className="list-row">
            <span>No attendance records in selected filter.</span>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {visibleEmployeeRows.map((employeeRow) => {
          const records = filteredAttendanceByEmployee.get(employeeRow.id) ?? [];
          const latest = records[0];
          const status = latest && !latest.checkOut ? "Checked In" : "Checked Out";
          const isSelected = selectedEmployeeId === employeeRow.id;
          const isManagerRecord = employeeRow.role === "manager";
          const canModifyEmployeeData = role === "admin" || (role === "manager" && !isManagerRecord);

          const recordsByDate = records.reduce<Record<string, Attendance[]>>((grouped, record) => {
            const key = getLocalDateKey(record.checkIn);
            if (!key) {
              return grouped;
            }
            if (!grouped[key]) {
              grouped[key] = [];
            }
            grouped[key].push(record);
            return grouped;
          }, {});
          const dateKeys = Object.keys(recordsByDate).sort((a, b) => b.localeCompare(a));
          const preferredDate = selectedDateByEmployee[employeeRow.id];
          const selectedDate =
            (preferredDate && recordsByDate[preferredDate] ? preferredDate : "") ||
            (recordsByDate[todayDate] ? todayDate : dateKeys[0] ?? "");
          const selectedDateRecords = selectedDate ? recordsByDate[selectedDate] ?? [] : [];
          const otherDateKeys = dateKeys.filter((key) => key !== selectedDate);

          return (
            <div key={employeeRow.id}>
              <div
                className={`list-row attendance-summary clickable${isSelected ? " is-selected" : ""}`}
                onClick={() => setSelectedEmployeeId((current) => (current === employeeRow.id ? null : employeeRow.id))}
                role="button"
                tabIndex={0}
              >
                <span>
                  {employeeRow.name}
                  {employeeRow.role === "manager" ? " (Manager)" : ""}
                </span>
                <span>
                  <span className={`status-pill ${status === "Checked In" ? "status-in" : "status-out"}`}>
                    {status}
                  </span>
                </span>
                <span>{latest ? formatDateTime(latest.checkIn) : "-"}</span>
                <span>{latest?.checkOut ? formatDateTime(latest.checkOut) : "-"}</span>
                <span>{latest ? formatHours(latest) : "-"}</span>
                <span>{latest ? formatBreakHours(latest) : "0.00"}</span>
              </div>

              {isSelected && (
                <div className="row-expand">
                  <div className="detail-header">
                    <div>
                      <strong>
                        {employeeRow.name}
                        {employeeRow.role === "manager" ? " (Manager)" : ""}
                      </strong>
                      <div className="helper">
                        Showing {selectedDate ? formatDateLabel(selectedDate) : "selected date"} data | Work: {formatHoursMinutesFromMs(totalWorkMs(selectedDateRecords))} | Break: {formatHoursMinutesFromMs(totalBreakMs(selectedDateRecords))}
                      </div>
                    </div>
                  </div>

                  <div className="attendance-date-row">
                    {otherDateKeys.length > 0 && <span className="helper">Other Days:</span>}
                    {otherDateKeys.map((dateKey) => (
                      <button
                        key={dateKey}
                        className={`date-chip${selectedDate === dateKey ? " active" : ""}`}
                        type="button"
                        onClick={() => setSelectedDateByEmployee((current) => ({ ...current, [employeeRow.id]: dateKey }))}
                      >
                        {formatDateLabel(dateKey)}
                      </button>
                    ))}
                  </div>

                  <div className="mini-table">
                    <div className="mini-row mini-head">
                      <span>Check In</span>
                      <span>Check Out</span>
                      <span>Work Hours</span>
                      <span>Break Hours</span>
                      <span>Actions</span>
                    </div>
                    {selectedDateRecords.length === 0 ? (
                      <div className="mini-row">
                        <span className="helper">No attendance on selected date</span>
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      selectedDateRecords.map((record) => (
                        <div className="record-block" key={record.id}>
                          <div className="mini-row">
                            <span>{formatDateTime(record.checkIn)}</span>
                            <span>{record.checkOut ? formatDateTime(record.checkOut) : "-"}</span>
                            <span>{formatHoursMinutesFromMs(workDurationMs(record))}</span>
                            <span>{formatHoursMinutesFromMs(breakDurationMs(record.breaks))} ({record.breaks?.length ?? 0} breaks)</span>
                            <span>
                              {canModifyEmployeeData && (
                                <button className="ghost" type="button" onClick={() => handleDelete(record)}>
                                  Delete
                                </button>
                              )}
                            </span>
                          </div>

                          <div className="break-history">
                            <div className="break-history-head">
                              Break details ({record.breaks?.length ?? 0})
                            </div>
                            <div className="break-row break-row-head">
                              <span>Break In</span>
                              <span>Break Out</span>
                              <span>Duration</span>
                            </div>
                            {(record.breaks?.length ?? 0) === 0 ? (
                              <div className="break-row">
                                <span className="helper">No breaks</span>
                                <span />
                                <span />
                              </div>
                            ) : (
                              record.breaks?.map((item) => (
                                <div className="break-row" key={item.id}>
                                  <span>{formatDateTime(item.breakStart)}</span>
                                  <span>{item.breakEnd ? formatDateTime(item.breakEnd) : "-"}</span>
                                  <span>{formatDuration(item.breakStart, item.breakEnd)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
