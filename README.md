# WorkFlow ERP

Modern WorkFlow ERP web application to manage employees, invoices, attendance, leave requests, and profile/settings with secure JWT authentication.

---

## What This Project Does

This project helps a company run daily HR and operations workflows from one dashboard:

- Employee records and roles
- Attendance (check-in, check-out, breaks)
- Leave request and approval flow
- Invoice tracking
- User profile and settings management
- Secure login with JWT

---

## Technology Used

### Backend
- **Language:** Go
- **Framework:** Gin
- **Database ORM:** GORM
- **Database:** MySQL
- **Auth:** JWT (access + refresh tokens)

### Frontend
- **Language:** TypeScript
- **Framework:** React (Vite)
- **HTTP Client:** Axios
- **Routing:** React Router

---

## Add Project Images Here

You can replace these placeholders with your own screenshots.

### 1) Dashboard Image
![Dashboard Screenshot](./docs/images/dashboard.png)

### 2) Login Image
![Login Screenshot](./docs/images/login.png)

### 3) Attendance Image
![Attendance Screenshot](./docs/images/attendance.png)

> Create the folder `docs/images` and add your image files with these names, or change the paths to your own image names.

---

## Backend Overview

Backend is in `backend/` and provides REST APIs under `/api`.

- Public auth APIs: login, refresh token, forgot-password OTP
- Protected APIs: dashboard, employees, invoices, attendance, leaves, profile, settings
- JWT middleware protects private routes
- DB schema is handled through GORM auto-migration

---

## Project Installation

### Prerequisites
- Go 1.21+
- Node.js 18+
- Docker

### 1) Clone project
```bash
git clone <your-repo-url>
cd Erp_go
```

### 2) Start database
```bash
docker compose up -d
```

### 3) Install frontend dependencies
```bash
cd frontend
npm install
cd ..
```

---

## Environment Setup

### Backend `.env` (`backend/.env`)
```env
APP_ENV=local
APP_ADDR=:8080
DB_DSN=erp_user:erp_password@tcp(127.0.0.1:3306)/erp_db?charset=utf8mb4&parseTime=True&loc=Local
JWT_SECRET=change_this_secret
JWT_ACCESS_MINUTES=15
JWT_REFRESH_HOURS=168
OTP_MINUTES=10
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_app_password
SMTP_FROM=WorkFlow ERP Support <your_email>
ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend `.env` (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8080
```

---

## Run Backend Server

```bash
cd backend
go run ./cmd/server
```

Backend starts on `http://localhost:8080` (based on `APP_ADDR`).

---

## Run Frontend Server

```bash
cd frontend
npm run dev
```

Frontend starts on Vite default URL (usually `http://localhost:5173`).

---

## Data Migration Command

This project uses **GORM AutoMigrate**.

- Migration runs automatically when backend starts.
- Command to run migration (auto):

```bash
cd backend
go run ./cmd/server
```

Optional build check:
```bash
cd backend
go build ./...
```

---

## Important Note (Auth)

- Login + JWT + refresh flow is active.
- Forgot-password OTP flow is active.
