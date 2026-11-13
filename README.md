# Adora Backend API

The production-ready backend REST API and background worker service for the **Adora** rider-based outdoor advertising platform. Built with Node.js, Express, TypeScript, Prisma ORM, MongoDB Atlas (NoSQL), Redis 7, and BullMQ.

---
V1
## Architecture & Features

- **Database & NoSQL Persistence**:
  - Hosted on **MongoDB Atlas** using Prisma's native MongoDB provider.
  - Native document models with full indexing and transactional integrity.
  - Automatic schema push and collection synchronization via `prisma db push`.
- **Authentication & Authorization**:
  - Secure Argon2id password hashing.
  - Dual JWT authentication (short-lived access tokens + HttpOnly rotating refresh cookies).
  - Role-Based Access Control (RBAC): `ADMIN`, `RIDER`, and `CUSTOMER`.
- **Campaign & Ad Lifecycle**:
  - Advertising plans with configurable pricing and duration.
  - Razorpay order creation and idempotent webhook processing with HMAC signature verification.
  - Campaign assignment matching verified riders to active campaigns.
- **Rider Operations & Proof Verification**:
  - **Start Trip**: Start odometer reading with initial meter photo and vehicle ad photo.
  - **End Trip**: Closing odometer reading with closing meter photo and vehicle ad photo proof.
  - Kilometer calculation and daily caps with anti-fraud sanity checks.
  - Admin audit trails for approving/rejecting logs.
- **High Availability & Performance**:
  - Fast-failing Redis rate limiting with automatic timeouts to prevent API request stalls.
  - BullMQ background workers for automated log completion, location cleanup, and webhook retries.
  - Swagger / OpenAPI 3.0 interactive documentation at `/api/v1/docs`.

---

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript
- **Framework**: Express 4
- **Database & ORM**: MongoDB Atlas via Prisma ORM
- **Cache & Queue**: Redis 7 via ioredis & BullMQ
- **Validation**: Zod
- **Logging**: Pino & Pino-HTTP structured JSON logging
- **Storage**: Cloudinary / Multer
- **Payment Gateway**: Razorpay

---

## Getting Started

### 1. Prerequisites
- Node.js 20+
- MongoDB Atlas cluster URI (`mongodb+srv://...`)
- Redis 7

### 2. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your MongoDB Atlas connection string:
```env
PORT=5000
DATABASE_URL="mongodb+srv://<username>:<password>@cluster0.mongodb.net/adora?retryWrites=true&w=majority"
REDIS_URL="redis://localhost:6379"
```

### 3. Database Synchronization & Seeding
```bash
# Push schema and create collections/indexes on MongoDB Atlas
npm run db:push -w backend

# Seed default advertising plans
npm run db:seed -w backend
```

### 4. Run Development Servers
```bash
# Run API server with hot-reload
npm run dev

# Run BullMQ background worker (separate terminal)
npm run jobs -w backend
```

API will be running on `http://localhost:5000`.  
Swagger documentation is available at `http://localhost:5000/api/v1/docs`.

### 5. Build for Production
```bash
npm run build -w backend
npm start -w backend
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health/ready` | Dependency health check (MongoDB Atlas + Redis) |
| `GET` | `/api/v1/docs` | Swagger OpenAPI interactive documentation |
| `POST` | `/api/v1/auth/login` | User login (Admin & Rider) |
| `POST` | `/api/v1/auth/riders/signup` | Rider registration |
| `POST` | `/api/v1/rider/logs/start` | Start daily log with odometer & ad photo |
| `POST` | `/api/v1/rider/logs/end` | End daily log with closing odometer & ad photo |
| `GET` | `/api/v1/rider/me` | Rider profile, stats & earnings |
| `GET` | `/api/v1/admin/dashboard` | Administrative overview metrics |
| `GET` | `/api/v1/admin/ads` | Campaign queue and approvals |
| `GET` | `/api/v1/admin/logs` | Review and verify rider trip logs |
| `GET` | `/api/v1/admin/payouts` | Payout calculation and generation |

---

## License
Private & Proprietary - Adora Platform
