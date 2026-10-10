# Off-the prototype builder migration — rebuild a prototype-builder app on owner infra

**When to reach for it:** a client (or the studio) has an app built inside the prototype builder
(or any hosted low-code builder that owns the Supabase project, the repo, and the
deploy) and wants it OFF that platform onto infra they control — their own git
repo, their own Vercel, their own Supabase project. This is a **repeatable
client-liberation offer**: "we free your app from the builder, you own everything,
nothing breaks." Stack-agnostic on the app side (the prototype builder emits Vite + React + TS +
Tailwind + shadcn + Supabase), so it pairs with the `vite-react-supabase/` build
patterns for whatever you touch after.

Harvested from `D:\flavornews-web` (a prototype-builder-built Good News USA / Flavor News
site with 22 edge functions, Stripe, PWA, ~73 migrations — cleanly migrated to
owner git + Vercel + a fresh Supabase project with auth seeded and zero data loss).

---

## The gotcha that defines this whole job

**the builder's `supabase/migrations/` folder is NOT a reliable rebuild source.** A
mature the prototype builder project accumulates dozens of migrations (73 here) that were
applied incrementally against a live DB — later ones assume state earlier ones
left, some were hand-edited in the dashboard and never captured, and the set does
NOT replay clean into an empty project. **Rebuild from a FULL BACKUP schema dump,
not the migrations.** Pull `schema/schema.sql` (Supabase dashboard → Database →
Backups, or `supabase db dump --schema public,auth,storage`) from the SOURCE
project and apply THAT as one migration into the new project. The migrations
folder is history, not a build script.

---

## Step 1 — strip the builder's fingerprints from the repo

the prototype builder injects build-time tooling and lockfiles that will fail or phone home on
owner infra. Before the first owner commit, remove:

- `prototype-builder-tagger` — a Vite plugin in `vite.config.ts` (dev-only component tagger).
  Delete the import + the `plugins` entry. It errors on a plain `npm run build`.
- `.the prototype builder/` — builder metadata dir. Delete.
- `bun.lockb` — the prototype builder builds with Bun; the studio box builds with npm on
  Windows and Bun ENOENTs here (see memory `[[prototype-builder-cicheck-bun-windows]]`).
  Delete it and commit `package-lock.json` instead (`npm install` regenerates).
- Any `bun`-spawning git hook (`.husky/pre-push` calling `bun`). Either remove it
  or push with `--no-verify` (see the memory note).
- `README`/meta references to the prototype builder.dev project URL, "Edit in the prototype builder"
  badges, and the `<script>` the prototype builder sometimes injects into `index.html`.

Grep to confirm you got them all:
```sh
grep -rl "the prototype builder" --include=*.ts --include=*.json --include=*.html . | grep -v node_modules
```

Then `git init` (the builder's repo is theirs — start clean history the studio owns),
first commit, new GitHub repo under the deploy identity (see
`[[deploy-identity]]`: commit as a real GitHub account email or Vercel blocks it).

## Step 2 — new Supabase project, rebuilt from the schema dump

1. `create_project` a fresh Supabase project the client owns.
2. Get the **full-backup** `schema/schema.sql` from the source project (Backups →
   download, or `supabase db dump`). This is the ground truth, **not**
   `supabase/migrations/*`.
3. Apply it into the new project as ONE migration (`apply_migration` /
   `execute_sql`). Verify each expected object landed — `list_tables`,
   `list_migrations`, query `pg_policies` for RLS (a migration is atomic; a single
   failed statement silently rolls back the whole thing — see STANDARDS
   "Migrations are atomic").
4. Deploy every edge function (`supabase functions deploy` or
   `deploy_edge_function` per function). Flavor News had 22 (payments, webhook,
   digests, admin, PDF-cover extraction).

## Step 3 — seed `auth.users` by SQL (the empty-token-column incantation)

The schema dump gives you `public` tables and RLS but NOT the users (backups omit
`auth.users` rows, or you only want the owner + a few admins). Seed them by SQL —
and every GoTrue token column MUST be `''`, not NULL, or login 500s with
"Database error querying schema" (see STANDARDS + `[[supabase-nextjs-gotchas]]`):

```sql
-- Owner/admin, pre-confirmed, password set via crypt()
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'owner@example.com',
  crypt('TEMP-PASSWORD', gen_salt('bf')), now(), now(), now(),
  '', '', '', '', '', ''          -- <-- empty strings, NEVER null
);

-- Matching identity row (GoTrue needs it for email/password login)
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select id, id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users where email = 'owner@example.com';
```

Then **recreate the `on_auth_user_created` trigger** — the prototype builder apps almost always
have a `handle_new_user()` trigger that inserts a `public.profiles` row on signup.
The schema dump captures the function but the trigger on `auth.users` may not
replay (it's in the `auth` schema). Recreate it via `apply_migration`:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Verify by signing up a throwaway user and confirming a `profiles` row appears.

## Step 4 — edge-function secrets via `--env-file`

Edge functions need the server-side secrets (Stripe secret key, webhook signing
secret, service-role key, Resend key) that live in the SOURCE project's function
config, not in the repo. Set them on the new project in one shot:

```sh
supabase secrets set --env-file ./supabase/.env.functions --project-ref <new-ref>
```
Keep that env file **gitignored** — never commit a secret fragment (STANDARDS +
`[[no-secret-fragments-in-tracked-files]]`). Re-point the Stripe webhook endpoint
URL at the new project's function, and rotate any secret that ever sat in the
source builder's UI if the client is leaving the platform for trust reasons.

## Step 5 — Vercel, with its two quiet gotchas

- **Env var quote-stripping.** When you paste `VITE_*` values into the Vercel
  dashboard, do NOT wrap them in quotes — Vercel stores the quotes literally and
  the value ships to the browser as `"pk_live_..."` with quotes, breaking the SDK.
  Paste the raw value.
- **`vercel env pull --no-sensitive`** (or adding a var via CLI without the flag):
  sensitive-marked vars won't come down to a local `.env`, so a local build that
  reads them silently gets blanks. Either mark them non-sensitive for the
  `VITE_*` public keys (they ship to the browser anyway) or set them locally by
  hand. Also: `.env.local` in the migrated repo may still hold the OLD project's
  keys — confirm the live project via MCP before any money/DB action (STANDARDS).

For a Vite SPA set framework = Vite, build = `npm run build`, output = `dist/`,
add SPA rewrite + security headers in `vercel.json`.

---

## Definition of done (verify, don't assume)
- [ ] `npm run build` is green with zero `prototype-builder-*` references left.
- [ ] Fresh Supabase project has every table + RLS policy from the dump (queried,
      not assumed) and all edge functions deployed.
- [ ] Owner can log in (proves the empty-token seed) and a new signup creates a
      `profiles` row (proves the trigger).
- [ ] A live curl of the Stripe webhook + one payment edge function returns
      healthy (proves secrets set + endpoint re-pointed).
- [ ] Vercel prod loads with real (unquoted) env values, no console errors.
- [ ] Client owns: the GitHub repo, the Vercel project, the Supabase project.

## Assumes / adapt
- Assumes a prototype-builder-emitted **Vite + React + TS + Tailwind + shadcn + Supabase**
  app (the common the prototype builder shape). A different builder swaps step 1's fingerprints
  but the schema-dump-not-migrations rule and the auth-seed rule are universal.
- The `crypt()`/`gen_salt('bf')` seed needs `pgcrypto` (Supabase has it). Prefer
  `auth.admin.createUser` (Admin API) over raw SQL when you can reach it — it
  handles the token columns for you; use the SQL form when scripting many users
  or when you only have DB access.
- Cross-links: `[[prototype-builder-cicheck-bun-windows]]`, `[[supabase-nextjs-gotchas]]`,
  `[[deploy-identity]]`, `[[no-secret-fragments-in-tracked-files]]`,
  `stripe-connect/admin-allowlist-hand-created-user.md` (the same
  pre-confirmed-`auth.users` SQL incantation, for the no-service-role case).
