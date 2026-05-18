# 🦁 Meedo Backend Server

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A robust, high-performance NestJS backend service for the **Meedo** application. Powered by **Prisma** ORM and **PostgreSQL**, this service features an advanced face recognition module utilizing vector embeddings via **pgvector**.

---

## 🚀 Key Features

*   **NestJS Architecture:** Built on top of TypeScript for clean, modular, and maintainable enterprise-grade backend design.
*   **Bun Runtime:** Supercharged performance and faster package resolutions.
*   **Prisma ORM:** Fully type-safe database queries and automated migrations.
*   **Vector Embeddings:** Face recognition analytics powered by PostgreSQL's `pgvector` extension.
*   **Secure Authentication:** Structured authentication flow integrated with Better Auth.

---

## 📂 Project Structure

Here is a quick overview of the key directories in the repository:

```text
├── prisma/                 # Database schema definitions and migration history
│   └── schema.prisma       # Core database schema model
├── src/                    # Main application source code
│   ├── modules/            # Domain-specific modules (CRM, maintenance, etc.)
│   ├── main.ts             # Application entrypoint
│   └── app.module.ts       # Root module definition
├── .env.example            # Template for environment configuration
├── Dockerfile              # Container deployment configuration
└── package.json            # Scripts, metadata, and dependencies
```

---

## ⚙️ Quick Start Guide

Follow these steps to set up the development environment on your local machine:

### 1. Clone the Repository
Clone the repository and navigate to the project root:
```bash
git clone https://github.com/Geoplan-Philippines/meedo-server.git
cd meedo-server
```

### 2. Install Dependencies
This project uses **Bun** as the primary package manager. Run the following command to install dependencies:
```bash
bun install
```

### 3. Configure Environment Variables
Copy the env template file to create your local environment file:
```bash
cp .env.example .env
```

Open `.env` and fill in the required configurations:
```env
# Basic App Settings
NODE_ENV=development
APP_URL=http://localhost:8000
PORT=8000

# Database Settings
DATABASE_URL="postgresql://postgres:password@localhost:54321/meedo"

# Better Auth Configuration
BETTER_AUTH_SECRET=your-secret-key

# Security & CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:4200

# Face Recognition Service
FACE_API_BASE_URL=http://localhost:8001/api/v1
FACE_API_TIMEOUT_MS=8000
```

---

## 🗄️ Database Setup

Configure Prisma and initialize the database schema with the following commands:

### 1. Generate Prisma Client
```bash
bunx prisma generate
```

### 2. Run Database Migrations
```bash
bunx prisma migrate dev
```

### 3. Enable pgvector Extension
Run the following SQL query inside your PostgreSQL database (using **pgAdmin Query Tool**, **psql**, or your favorite database manager) to enable vector support:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

> [!NOTE]
> If you need to wipe and reset your database schema for clean re-migrations, you can run:
> ```bash
> bunx prisma migrate reset
> ```

---

## 📦 pgvector Setup (Windows Installation Guide)

If the `pgvector` extension is not automatically available via PostgreSQL StackBuilder, you can install it manually by following these steps:

1. **Obtain the Binary:** Download the appropriate pre-compiled `pgvector` zip file matching your PostgreSQL version (e.g., `vector.v0.8.2-pg18.zip`). *Contact the team for the correct binary if needed.*
2. **Extract Files:** Extract the contents of the zip file.
3. **Deploy to Postgres Directory:** Copy the extracted folders and merge them directly into your local PostgreSQL installation directory (typically `C:\Program Files\PostgreSQL\<version>\`):
    *   `bin/` ➔ `C:\Program Files\PostgreSQL\<version>\bin\`
    *   `lib/` ➔ `C:\Program Files\PostgreSQL\<version>\lib\`
    *   `share/` ➔ `C:\Program Files\PostgreSQL\<version>\share\`
4. **Restart PostgreSQL:** Open the Windows **Services** manager (`services.msc`), locate **postgresql-x64-<version>**, and click **Restart**.
5. **Activate the Extension:** Connect to your database and run:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```

---

## 💻 Running the Server

Use the following commands to run the application runtime:

### Development Mode (with Hot Reload)
```bash
bun run start:dev
```

### Production Mode
```bash
bun run build
bun run start:prod
```

The server will initialize and listen on the configured port. By default:
*   **Server URL:** [http://localhost:8000](http://localhost:8000)
*   **API Base URL:** [http://localhost:8000/api/v1](http://localhost:8000/api/v1)

---

## 🧪 API Validation & Health Checks

You can verify the status of the server by hitting the built-in health check endpoint:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api/v1/health` | Performs health checks on database connectivity and critical services. |

---

## 📝 Important Notes & Best Practices

> [!IMPORTANT]
> *   **PostgreSQL Status:** Make sure your PostgreSQL server is up and running before booting the backend.
> *   **Connection Ports:** Double-check the port inside your `DATABASE_URL` (e.g., `5432` or dockerized port `54321`).
> *   **Face Recognition:** `pgvector` must be successfully registered in the database for face recognition features to operate.
> *   **Production Credentials:** Never share or check-in actual credentials. Always use a strong, cryptographically secure `BETTER_AUTH_SECRET` in staging/production environments.