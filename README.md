# Sutra Collections ERP

A full-featured ERP system for a clothing shop — GST billing, inventory management, tailoring order tracking, accounting, CRM, and WhatsApp notifications. Built as a single self-hosted Docker application.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router (full-stack) |
| Database | PostgreSQL 15 |
| Auth | Session-based (iron-session) |
| Containerization | Docker Compose |
| Notifications | Meta WhatsApp Cloud API |
| PDF generation | @react-pdf/renderer |
| AI Import | Google Gemini API |
| Public access | Cloudflare Tunnel / Nginx reverse proxy |

## Features

- **GST Billing** — Tax-inclusive invoicing with CGST/SGST split, credit notes, debit notes
- **Inventory** — Items, variants, stock movements, low-stock alerts
- **Tailoring Orders** — Full lifecycle tracking, batch bookings, production board
- **Accounting** — Double-entry ledger, GSTR-1, GSTR-3B, P&L, balance sheet
- **CRM** — Customer loyalty points, birthday greetings, outstanding dues tracking
- **WhatsApp** — Order confirmations, payment reminders, tailor assignments
- **AI Import** — Bulk import inventory/customers via Gemini-parsed spreadsheets
- **Staff** — Attendance calendar, payroll engine
- **Roles** — Admin, Accountant, Staff (warehouse-scoped)

## Running Locally

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development without Docker)

### Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd sutra-collections

# 2. Set up environment
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD, SESSION_SECRET, SA_SESSION_SECRET

# 3. Start all services
docker compose up -d --build

# 4. App is running at http://localhost:3000
# SA console at http://localhost:3000/sa-console-x7k2
```

### Local Development (without Docker)

```bash
npm install
# Requires a local PostgreSQL instance — set DATABASE_URL in .env
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

| Variable | Description |
|---|---|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password (change from default!) |
| `POSTGRES_DB` | Database name |
| `DATABASE_URL` | Full connection string — must match above |
| `SESSION_SECRET` | 64-char random string for session encryption |
| `SA_SESSION_SECRET` | Separate secret for super-admin console sessions |
| `CRON_SECRET` | Bearer token to authorize cron job calls |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta Business Manager |
| `WHATSAPP_ACCESS_TOKEN` | Permanent token from Meta Business Manager |
| `WHATSAPP_WEBHOOK_TOKEN` | Verify token for webhook setup |
| `GEMINI_API_KEY` | For AI-powered data import (optional) |
| `NODE_ENV` | Set to `production` in production |

Generate secrets:
```bash
openssl rand -base64 64   # for SESSION_SECRET / SA_SESSION_SECRET
openssl rand -hex 32      # for CRON_SECRET
```

## Deploying to Production (Google Cloud VM)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full step-by-step instructions.

Quick version:
```bash
# On your Ubuntu 22.04 Google Cloud VM:
curl -O https://raw.githubusercontent.com/YOUR_REPO/main/deploy.sh
chmod +x deploy.sh
./deploy.sh
```

## Project Structure

```
sutra-collections/
├── app/              # Next.js App Router pages and API routes
│   ├── (auth)/       # Authenticated pages (billing, inventory, etc.)
│   ├── api/          # API routes (health, cron, webhooks)
│   └── login/        # Auth pages
├── components/       # Shared React components
├── lib/              # Server-side utilities (DB, auth, PDF, WhatsApp)
├── db/               # schema.sql and migrations
├── backup/           # Automated PostgreSQL backup service
├── updater/          # Auto-updater service
├── nginx/            # Nginx reverse proxy config
├── scripts/          # Seeding and maintenance scripts
├── docker-compose.yml         # Local development
└── docker-compose.prod.yml    # Production deployment
```

## Backup

Daily PostgreSQL dumps are written to `./backups/` automatically by the backup service. Store copies offsite — the VM disk is the only copy.

## License

Private — Sutra Collections internal use only.
