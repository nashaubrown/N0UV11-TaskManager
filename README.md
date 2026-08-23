# NOUVII — Task Manager & Photo Library

A task management + photo library platform with approval workflows, AI auto-tagging,
CRM links, and a client review portal. React 18 + TypeScript frontend, Node/Express
backend (Phase 2), PostgreSQL, AWS S3, installable PWA (Phase 3).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Design system, component library, layouts, pages | ✅ Done |
| 2 | Express API, auth, Google Calendar sync | ✅ Done |
| 3 | PWA — offline, camera, push | ✅ Done |
| 4 | Claude Vision auto-tagging | ✅ Done |
| 5 | Client approval portal | ✅ Done |

## Quick start

**Frontend**

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
```

**Backend** (requires PostgreSQL 15+)

```bash
cd server
npm install
cp .env.example .env             # set DATABASE_URL
createdb nouvii                  # or use an existing database
npm run db:apply                 # applies ../database-schema.sql
npm run db:pull && npm run db:generate   # Prisma introspects the schema
npm run db:seed                  # demo org — login nashaubrown@gmail.com / nouvii123
npm run dev                      # API on http://localhost:4000
```

> **Windows PowerShell note:** `&&` doesn't work in Windows PowerShell 5.1 —
> run each command on its own line (or use PowerShell 7+). Easiest database
> setup on Windows is Docker Desktop: `docker compose up -d` starts Postgres
> with the credentials already in `server/.env.example`. Without Docker,
> install PostgreSQL 16 (`winget install PostgreSQL.PostgreSQL.16`) and use
> pgAdmin or psql to create a `nouvii` database, then set DATABASE_URL.

- Swagger docs: http://localhost:4000/api/docs
- WebSocket events: `ws://localhost:4000/ws?token=<accessToken>`
- Smoke tests: `node server/smoke.test.mjs` (39 checks; server must be running)

**Full stack**: with both running, the app at :5173 shows a login screen —
sign in with the seeded account (or create your own workspace) and all data
persists to Postgres, uploads go through the presigned flow, and changes
broadcast live to every open tab over WebSocket.

**Demo mode** (no backend): `npm run dev:demo` — runs on in-memory mock data,
no login. The shareable artifact preview uses this mode.

## Optional integrations (all inert until configured in server/.env)

| Feature | Enable with |
|---|---|
| Google Calendar sync | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (OAuth client, redirect `http://localhost:4000/api/calendar/callback`) |
| Claude Vision auto-tagging | `ANTHROPIC_API_KEY` (model via `AI_MODEL`, default `claude-opus-5`) |
| Web push notifications | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`) + `VAPID_SUBJECT` |
| S3 storage | `STORAGE_DRIVER=s3` + `S3_BUCKET`/`S3_REGION` (+ `S3_PUBLIC_BASE_URL` for CloudFront) |
| Cloudflare R2 storage | as S3, plus `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com` (+ `S3_PUBLIC_BASE_URL` = your `r2.dev` or custom domain). Create the bucket + an R2 API token (Object Read & Write) in the Cloudflare dashboard; the token's key/secret go in the usual `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` |
| Google Drive backup | every uploaded photo is mirrored to a Drive folder. Create a service account (Google Cloud → IAM → Service Accounts → key as JSON), share the target Drive folder with the service account's email, then set `GDRIVE_SERVICE_ACCOUNT_JSON` (the JSON, single line) + `GDRIVE_FOLDER_ID` (from the folder URL) |
| Instagram analytics (IG login — recommended) | Works with just the merchant's Instagram professional account, **no Facebook Page needed**. In the Meta app add the **Instagram** product ("API setup with Instagram business login"), copy that tab's Instagram App ID/Secret into `IG_APP_ID` + `IG_APP_SECRET`, and register `IG_REDIRECT_URL` (default `http://localhost:4000/api/analytics/oauth/instagram/callback`) as a valid OAuth redirect there. While the app is in Development mode, add the merchant IG account under App roles → Instagram testers (and accept the invite from the IG app) |
| Instagram analytics (Facebook fallback) | For IG accounts already linked to a Facebook Page: add **Facebook Login for Business**, register `META_REDIRECT_URL` (default `http://localhost:4000/api/analytics/oauth/callback`), and set `META_APP_ID` + `META_APP_SECRET` |

## Client review portal

"Share for review" on any project creates a signed, 30-day link
(`/portal/<token>` — only a hash is stored). Clients need no account: they
see the project's photos, approve / reject / request changes, and comment.
Every action is recorded with their name in the audit log and lands in the
team's UI live over WebSocket.

Reviewers can also **draw directly on a photo** (Draw on photo → coral pen,
undo/clear) — the markup is saved with their comment and shows up overlaid
on the photo in the team's comment thread.

## Stack decisions (Phase 1)

- **Styling:** Tailwind CSS v4 + NOUVII design tokens as CSS custom properties
  (`src/styles/tokens.css`). Light/dark themes swap via `data-theme` on `<html>`.
- **State:** Zustand for UI state (`src/store`), TanStack Query for server state
  (wired to the real API in Phase 2).
- **Routing:** React Router with lazy-loaded pages.
- **Motion:** Framer Motion (modals, drawers, card hover, tab underline).
- **Icons:** lucide-react. **Dates:** date-fns. **Validation:** zod (Phase 2 forms).

## Project structure

```
database-schema.sql        PostgreSQL schema (source of truth — Prisma introspects it)
database-architecture.md   Schema guide & operational notes
server/
  src/
    routes/    auth, projects, tasks, photos, uploads, approvals,
               merchants, crm (contacts+deals), org (members+audit), calendar
    middleware/ auth (JWT + roles), validate (zod), error handler
    services/  storage (S3 presign / local dev driver), gcal (OAuth + outbox
               sync worker), audit
    ws/        org-scoped WebSocket hub (tasks/photos/comments/approvals/presence)
    types/     zod DTOs
  prisma/      introspected schema + seed
  openapi.yaml API reference (served at /api/docs)
src/
  components/
    common/    Button, Badge, Card, Avatar, Modal, Input/Select/Textarea,
               Tabs, ProgressBar, EmptyState, StatTile, TrendChart
    task/      TaskCard, TaskList, TaskForm
    photo/     PhotoCard, PhotoGallery, PhotoViewer (lightbox)
    approval/  ApprovalWorkflow (stepper)
    layout/    Header, Sidebar + MobileTabBar, AppShell
  pages/       Dashboard, Projects, ProjectView, Tasks, PhotoLibrary, Deals, Styleguide
  hooks/       useMediaQuery (breakpoint helpers)
  store/       theme (persisted), ui (sidebar, photo selection)
  services/    TanStack Query client
  types/       Domain types mirroring the DB schema + status display maps
  mocks/       Demo data (swapped for API calls in Phase 2)
```

## Design system

NOUVII branding: coral gradient `#FF6B5B → #C41E3A`, Sora (display) + Inter (body),
8px-based spacing, 4-step elevation. Accessibility baked in: WCAG-checked status
colors per theme, a dedicated chart-stroke token (≥3:1 on both surfaces), focus
rings, labels on every status pill (never color alone), reduced-motion support.

## Deployment

**Frontend — Vercel** (`vercel.json` handles SPA rewrites). A hosted build
with no `VITE_API_URL` env var runs in demo mode; set `VITE_API_URL` to the
hosted API's `/api` base URL to switch the same deployment to the real
backend.

**Backend — Render** (one blueprint, `render.yaml`):

1. [render.com](https://render.com) → **New +** → **Blueprint** → connect
   GitHub → select this repo → review the plans → **Apply**. This creates
   the `nouvii-api` service and its Postgres database, generates
   `JWT_SECRET`, applies the schema on every deploy, and mounts a 1 GB disk
   for photo storage.
2. When the service is live, copy its URL (e.g.
   `https://nouvii-api.onrender.com`).
3. Vercel → project → *Settings* → *Environment Variables* → add
   `VITE_API_URL` = `https://<your-api>.onrender.com/api` → redeploy.
4. Open the production site and **Sign Up** to create your real workspace
   (don't seed demo data into production).
5. Google Calendar callback: also add
   `GOOGLE_REDIRECT_URI=https://<your-api>.onrender.com/api/calendar/callback`
   to the Google OAuth client and Render env when enabling calendar sync.

Photos are stored on the service's persistent disk; switch to S3/CloudFront
at scale via `STORAGE_DRIVER=s3` + `S3_BUCKET`/`S3_REGION`.
