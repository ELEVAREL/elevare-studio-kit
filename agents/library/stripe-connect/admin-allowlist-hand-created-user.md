# Owner auth: email+password gated by an allowlist + a hand-created confirmed user (no service-role key)

**What it is.** The minimal owner/admin login for a *public-site + one-private-dashboard* app when you're running **without a `service_role` key** and don't want to wire Supabase Auth's email/SMTP just to onboard one operator. Two halves:
1. **Authorization** = a plain Supabase email+password login, but only emails in an `admin_emails` allowlist see or mutate anything — enforced by RLS *and* re-checked in every server action.
2. **The one owner account** is created directly in SQL (`auth.users` + `auth.identities`), pre-confirmed, with the **empty-string token-column incantation** that keeps GoTrue from rejecting the row.

**When to reach for it.** Any app with a small owner/staff group and no reason to build self-serve signup — an owner dashboard, a back-office console, an internal tool. Especially when you've committed to the studio's **no-service-role-key** posture (the security spine in [`quote-to-pay-connect-feesplit.md`](quote-to-pay-connect-feesplit.md)) and just need to stand up the one login.

*(Harvested from `D:\CoffeeBaby` — owner sign-in + `admin_emails` allowlist. Cross-links memory `[[supabase-nextjs-gotchas]]`, which is the canonical record of the token-column trap.)*

## 1. The allowlist (authorization, not a role column)

```sql
create table admin_emails (email text primary key);
alter table admin_emails enable row level security;
-- an authenticated user may read ONLY their own row (so the app can check "am I admin?"):
create policy "see own admin row" on admin_emails for select to authenticated
  using (email = lower(auth.jwt()->>'email'));

-- the protected resource trusts the allowlist, not a per-row flag:
create policy "admins read resource"   on quotes for select to authenticated
  using (exists (select 1 from admin_emails a where a.email = lower(auth.jwt()->>'email')));
create policy "admins update resource" on quotes for update to authenticated
  using (exists (select 1 from admin_emails a where a.email = lower(auth.jwt()->>'email')));
```

Grant admin = `insert into admin_emails values ('owner@example.com');` — no code deploy, no user-metadata edit, revocable with a `delete`.

**Belt-and-suspenders in app code.** Server actions still re-check the allowlist before writing — RLS is the floor, not the only gate:

```ts
async function requireAdmin() {
  const supabase = await createClient();               // cookie-based server client
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");
  const { data: row } = await supabase.from("admin_emails")
    .select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!row) throw new Error("Not authorized");
  return supabase;
}
```

Sign-in is stock `supabase.auth.signInWithPassword({ email, password })` from a browser client → `router.replace("/admin")`. A non-allowlisted authenticated user still logs in but every `quotes` read/write is empty/denied by RLS — the dashboard renders gated/empty rather than 500ing.

## 2. Hand-create the confirmed owner in SQL (the incantation)

With no `service_role` key and no configured Auth SMTP, mint the one account directly. **The trap:** a hand-inserted `auth.users` row with NULL token columns makes login fail with `Database error querying schema` (HTTP 500). GoTrue requires those columns to be **empty strings, not NULL**. Also insert the matching `auth.identities` row.

```sql
-- 1) the user (pre-confirmed, password hashed with bcrypt via pgcrypto's crypt())
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    -- ↓↓↓ the load-bearing bit: these MUST be '' not NULL ↓↓↓
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'owner@example.com', crypt('THE_TEMP_PASSWORD', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', ''
  )
  returning id, email
)
-- 2) the matching identity row (provider 'email', provider_id = the user id)
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select id, id, jsonb_build_object('sub', id::text, 'email', email),
       'email', now(), now(), now()
from new_user;
```

Then `insert into admin_emails values ('owner@example.com');` and hand the owner the temp password to change on first login.

## Assumes / adapt
- **Prefer the Auth admin API / dashboard "Add user" when you have it.** This SQL path is for the no-service-role / no-SMTP corner. If you have the admin API, use it and skip the incantation — the allowlist half stays the same.
- **`crypt`/`gen_salt` need pgcrypto**, which lives in the `extensions` schema. Run this where `extensions` is on the search_path, and remember that any *SECURITY DEFINER* function using them must pin `extensions` in its own `search_path` (`[[supabase-nextjs-gotchas]]`).
- **Set every one of the eight token columns to `''`.** Missing even one reintroduces the 500. `email_confirmed_at = now()` is what makes the account usable without an email round-trip.
- **Browser Supabase client must be a module-level singleton** — multiple `createClient()` instances race the rotating refresh token and cause random 401s post-login (`[[supabase-nextjs-gotchas]]` §2).
- **`lower()` both sides.** Store and compare emails lowercased everywhere (allowlist rows, the JWT claim, the app lookup) or a capitalized login silently fails the gate.
- **Supabase Auth redirect URL** must include the deployed origin (`https://<app>.vercel.app/**`) or sign-in is blocked in production even with a valid account.
- For a *self-serve* owner-onboarding-with-a-branded-email flow (no service-role key either), reach for [`ecommerce-supabase-stripe/magic-link-admin-onboarding.md`](../ecommerce-supabase-stripe/magic-link-admin-onboarding.md) instead — this doc is the "just make me the one login" path.
