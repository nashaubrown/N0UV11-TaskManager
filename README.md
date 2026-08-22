# NOUVII — Task Manager & Photo Library

A task management + photo library platform with approval workflows, AI auto-tagging,
CRM links, and a client review portal. React 18 + TypeScript frontend, Node/Express
backend (Phase 2), PostgreSQL, AWS S3, installable PWA (Phase 3).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Design system, component library, layouts, pages | ✅ Done |
| 2 | Express API, auth, Google Calendar sync | ⏳ Next |
| 3 | PWA — offline, camera, push | — |
| 4 | Claude Vision auto-tagging | — |
| 5 | Client approval portal | — |

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
```

Open **/styleguide** in the app for the living component catalog (all variants and
states — flip the header theme toggle to QA dark mode).

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
database-schema.sql        PostgreSQL schema (source of truth for types)
database-architecture.md   Schema guide & operational notes
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
