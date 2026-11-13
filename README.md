# Meedo backend server

NestJS API for Meedo. It uses Prisma, PostgreSQL, and the `pgvector` extension for face-recognition embeddings.

See [the data model guide](docs/DATA_MODEL.md) for internal projects, membership, tickets, timesheets, notifications, and manual Apptivo sync. Run `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` to type-check application code and specs. The single demo seed permits local development targets; production and all non-local targets require `SEED_ALLOWED_DATABASE_NAME` to exactly name the database.

## Stack

- [NestJS](https://nestjs.com/) and [TypeScript](https://www.typescriptlang.org/)
- [Bun](https://bun.sh/) for install and scripts
- [Prisma](https://www.prisma.io/) for queries and migrations
- [PostgreSQL](https://www.postgresql.org/) with `pgvector` for face-recognition embeddings
- Better Auth for authentication

## Project structure

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

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Geoplan-Philippines/meedo-server.git
cd meedo-server
```

### 2. Install dependencies

This project uses Bun.

```bash
bun install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set these values:

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

## Database

### 1. Generate the Prisma client

```bash
bunx prisma generate
```

### 2. Run migrations

```bash
bunx prisma migrate dev
```

### 3. Enable pgvector

Run this SQL in the database, with pgAdmin, psql, or another SQL client:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

To wipe the schema and reapply migrations:

```bash
bunx prisma migrate reset
```

## pgvector on Windows

If StackBuilder does not include `pgvector`, install the binary yourself.

1. Download the precompiled zip that matches your PostgreSQL version, for example `vector.v0.8.2-pg18.zip`. Ask the team if you need the binary.
2. Extract the zip.
3. Copy the extracted folders into the PostgreSQL install directory, usually `C:\Program Files\PostgreSQL\<version>\`:
    * `bin/` into `C:\Program Files\PostgreSQL\<version>\bin\`
    * `lib/` into `C:\Program Files\PostgreSQL\<version>\lib\`
    * `share/` into `C:\Program Files\PostgreSQL\<version>\share\`
4. Restart the service. Open `services.msc`, find `postgresql-x64-<version>`, and restart it.
5. Connect to the database and run:

    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```

## Run the server

### Development, with reload

```bash
bun run start:dev
```

### Production

```bash
bun run build
bun run start:prod
```

The process listens on the configured port. Defaults:

* Server: [http://localhost:8000](http://localhost:8000)
* API base: [http://localhost:8000/api/v1](http://localhost:8000/api/v1)

## Health check

| Method | Endpoint | What it checks |
| :--- | :--- | :--- |
| GET | `/api/v1/health` | Database connectivity and critical services |

## Before you start

* PostgreSQL has to be running before the API starts.
* Check the port in `DATABASE_URL` (`5432`, or `54321` when Postgres runs in Docker).
* Register `pgvector` in the database, or face recognition will not run.
* Do not commit real credentials. Use a strong random `BETTER_AUTH_SECRET` in staging and production.
