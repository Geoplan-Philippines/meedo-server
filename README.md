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

For users without Bun installed, execute the following command:

```bash
Windows:
powershell -c "irm bun.sh/install.ps1|iex"
```
Note: Bun requires Windows 10 version 1809 or later.

```bash
macOS & Linux:
curl -fsSL https://bun.com/install | bash
```
Note: Linux users. The unzip package is required to install Bun. Use sudo apt install unzip to install the unzip package. Kernel version 5.6 or higher is recommended; Bun runs on kernels as old as 3.10 (RHEL 7) with graceful degradation of newer syscalls. Use uname -r to check your kernel version.

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

### 1. Install PostgreSQL if not yet already:
 - Download PostgreSQL from the official website: https://www.pgadmin.org/
 - Run the installer.
 - During installation:
    - Keep the default components selected.
    - Set a password for the postgres user.
    - Keep the default port 5432.
 - Complete the installation.


### 2. Install the pgvector Extension:
 - Download the latest pgvector here: https://drive.google.com/file/d/1QQc5sj_bJbt92AIrmXzcvqqVVWM6XghV/view
 - Move or Copy the files inside the **pgvector** to C:\Program Files\PostgreSQL\18\
    ```bash
    Example: 
    Copy the vector.dll From C:\Users\<your pc>\Downloads\vector.v0.8.2-pg18\vector.v0.8.2-pg18\lib and move to C:\Program Files\PostgreSQL\18\lib\

    Copy everything from C:\Users\<your pc>\Downloads\vector.v0.8.2-pg18\vector.v0.8.2-pg18\share\extension and move to C:\Program Files\PostgreSQL\18\share\extension

    Copy the Vector folder from C:\Users\<your pc>\Downloads\vector.v0.8.2-pg18\vector.v0.8.2-pg18\include\server\extension and move to C:\Program Files\PostgreSQL\18\include\server\extension
    ```

### 3. Restart PostgreSQL
 - Press Win + R
    - Type: services.msc
 - Find: postgresql-x64-18
 - Right Click postgresql-x64-18 then press Restart

### 6. Generate Prisma Client
```bash
bunx prisma generate
```

### 7. Run Database Migrations
```bash
bunx prisma migrate dev
```

> [!NOTE]
> If you need to wipe and reset your database schema for clean re-migrations, you can run:
> ```bash
> bunx prisma migrate reset
> ```

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