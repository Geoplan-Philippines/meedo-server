# Meedo Backend Server

## Description
Backend service for the Meedo application built with NestJS, Prisma, and PostgreSQL.  
Includes face recognition features using vector embeddings (pgvector).

---

## Tech Stack
- NestJS
- Bun
- Prisma
- PostgreSQL
- pgvector

---

## Project Structure
src/    # Main application source code
prisma/ # Prisma schema and migrations
.env    # Environment variables (not committed)
.env.example # Example env template


---

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/Geoplan-Philippines/meedo-server
cd meedo-server
2. Install dependencies
bun install
3. Set up environment variables
cp .env.example .env

Update .env:

NODE_ENV=development
APP_URL=http://localhost:8000
PORT=8000

DATABASE_URL="postgresql://postgres:password@localhost:54321/meedo"

BETTER_AUTH_SECRET=your-secret-key

CORS_ALLOWED_ORIGINS=http://localhost:4200

FACE_API_BASE_URL=http://localhost:8001/api/v1
FACE_API_TIMEOUT_MS=8000


Database Setup
Generate Prisma Client
bunx prisma generate
Run migrations
bunx prisma migrate dev
Enable pgvector

Run in PostgreSQL (via pgAdmin Query Tool or psql):
CREATE EXTENSION vector;

Reset database (if needed)
bunx prisma migrate reset
pgvector Setup (Windows)

If pgvector is not available via StackBuilder, install it manually:

Obtain the pgvector binary (e.g. vector.v0.8.2-pg18.zip)

Extract the zip file

Copy contents to your PostgreSQL installation directory:

bin/   > C:\Program Files\PostgreSQL\<version>\bin\
lib/   > C:\Program Files\PostgreSQL\<version>\lib\
share/ > C:\Program Files\PostgreSQL\<version>\share\
Restart PostgreSQL service

Enable extension in database:
CREATE EXTENSION vector;

Note: Contact the team for the correct pgvector binary if not available.

Running the Server
bun run start
Server will run at:

http://localhost:8000
API Endpoints

Base URL:

http://localhost:8000/api/v1
Health Check
GET /api/v1/health
Notes
Ensure PostgreSQL is running

Make sure the correct port is used in DATABASE_URL

pgvector extension is required for face recognition features

Use a strong BETTER_AUTH_SECRET for production