# Monthly Money Plan

A monthly budget planner organised by bank account. Salaries land in banks. Money then leaves each bank directly, as cash, or on a card that is billed the following month. Balances roll forward from month to month.

It has these features:

- **Accounts:** sign up, sign in, password reset, and account settings.
- **Profiles:** one account can hold many profiles. Each profile is a separate money plan (for example a household, a business or a parent's accounts), and you switch between them from the top bar.
- **Sharing:** the owner of a profile invites partners by email as an **editor** or a **viewer**. Invitees accept from a link or from their Invitations page. Owners can change roles, remove people, revoke invitations and see an activity log.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

If Supabase isn't configured, the app runs in **demo mode**. Accounts and data stay in this browser's `localStorage`, and each browser tab keeps its own session. To try sharing, sign up as one user in one tab and as another user in a second tab.

> Demo mode is **not secure**. Don't enter real financial data.

## Connecting Supabase (production)

1. Create a Supabase project. Choose the region deliberately, because that's where the financial data will be stored.
2. Apply the schema, either with `supabase db push` or by pasting `supabase/migrations/*.sql` into the SQL editor.
3. In **Auth → Providers → Email**, keep **Confirm email** turned on. Invitations are matched to the invitee's *verified* email address. If confirmation is off, anyone could sign up with a partner's email address and accept their invitation.
4. In **Auth → URL configuration**, set the Site URL and add `<your-origin>/sign-in` and `<your-origin>/reset-password` as redirect URLs.
5. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_APP_URL`.

The anon key is designed to be public. Row-Level Security is what protects the data. **Never** ship the `service_role` key to the browser.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` runs lint, tests and the build on every push to `main`, then publishes to Pages.

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables:**
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Set `VITE_APP_URL=https://<user>.github.io/<repo>`.
   - Add `VITE_BASE_PATH=/` only if you use a custom domain.
3. **Supabase → Auth → URL configuration:** set the Site URL to the Pages URL, and add `<pages-url>/sign-in` and `<pages-url>/reset-password` as redirect URLs.

How the Pages limitations are handled:
- **Sub-path:** the site runs under `/<repo>/`. The build `base` and the router `basename` follow `VITE_BASE_PATH`.
- **Deep links:** `404.html` is a copy of `index.html`, so refreshing or opening a deep link works. Those pages are served with HTTP status 404, which is harmless for this app.
- **Security headers:** Pages can't set custom headers, so the CSP is injected as a `<meta>` tag at build time. HTTPS and HSTS come from GitHub on `*.github.io`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit, backend-contract and UI smoke tests (Vitest + jsdom) |
| `npm run test:db` | Apply the migrations to a throwaway Postgres in Docker and run the RLS security checks |
| `npm run lint` | Run ESLint |
| `npm run check` | Run lint, tests and build |

## Architecture

```
src/
  domain/            Pure money logic: months, ledger maths, installments, plan mutations. Unit-tested.
  services/
    backend.js       The backend contract (JSDoc) and adapter selection
    supabase/        Production adapter: Supabase Auth, PostgREST, RPCs, Realtime
    local/           Demo adapter: same rules as the SQL, backed by localStorage
  contexts/          AuthProvider, WorkspaceProvider (account, profiles, invitations),
                     ProfileProvider (load, autosave, conflicts, live updates), ToastProvider
  components/ui/     Reusable primitives: Button, Field, Modal, ConfirmDialog, Panel, Badge,
                     StatCard, AmountInput, Menu, NavTabs, Banner, …
  components/layout/ AppShell, ProfileSwitcher, UserMenu, ErrorBoundary
  features/          auth · plan (Month) · commitments · setup · profiles · invitations · settings
supabase/
  migrations/        Schema, RLS policies, RPCs
  tests/             RLS checks, run by `npm run test:db`
```

**Routes**

- Signed out: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
- Profiles: `/p/:profileId/{month,commitments,setup}`
- Settings: `/settings/{account,profiles,profiles/:id,invitations}`
- Invitations: `/invite/:id`

### Data model and permissions

| Table | Purpose | Who can read | Who can write |
| --- | --- | --- | --- |
| `accounts` | One row per user | Yourself, plus people you share a profile with | Yourself (name, currency) |
| `profiles` | One money plan (`data` jsonb + `version`) | Members | Owner renames. Data only via `save_profile_data()` (owner or editor) |
| `profile_members` | Who has access, and their role | Members | Owner changes other members. A member can leave |
| `invitations` | Pending access, addressed by email | Owner | Only via the `create_invitation` / `revoke_invitation` / `respond_invitation` RPCs |
| `audit_log` | Append-only trail of access changes | Owner | Only via triggers and RPCs |

- **Concurrency:** saves are optimistic. Each save sends the version it was based on. If a partner saved first, the server rejects the save with `version_conflict`, and the app reloads the partner's version and tells the user. Partner edits also arrive live through Supabase Realtime.
- **Viewed month:** the month you're looking at is kept in the URL (`?m=YYYY-MM`), so partners don't move each other around.

## Security and compliance notes

- Every table has RLS enabled. Column-level grants stop anyone from rewriting `owner_id`, `version` or `data` outside the RPC. The anon role has no access. `npm run test:db` checks all of this.
- Invitations expire after 14 days. They can only be accepted by an account with a matching, confirmed email address. An unknown invitation id and an invitation meant for someone else return the same error, so ids can't be probed.
- Passwords are handled by Supabase Auth. The demo adapter stores them as PBKDF2 hashes, never in plain text.
- Post-login redirects accept only same-origin paths, which prevents open redirects.
- Plan data is financial PII. Keep it out of logs and error reporters (see `ErrorBoundary`).
- Still to do:
  - Send invitation emails from an Edge Function. Today the owner shares the link, and the invitee also sees the invitation in the app.
  - Account deletion and data export for GDPR-style requests. Profile JSON export already exists.
  - A CSP header at the hosting layer.
  - MFA, which Supabase supports.

> Guidance above on data protection (e.g. GDPR, data residency) is technical, not legal advice. Validate it with qualified legal or compliance counsel before handling real customer data.
