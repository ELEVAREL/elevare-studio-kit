# First-party magic-link admin onboarding (no service-role key, no Supabase email)

**What it is.** Invite a first admin/owner and let them set their own password via a branded email link — **without** turning on Supabase's email/SMTP config, and **without** a `service_role` key. A single-use token in a `private` schema table is redeemed by a `SECURITY DEFINER` RPC that sets the auth user's password; the invite email is sent by your own Resend template.

**When to reach for it.** Onboarding the owner/first admin of any Supabase app where you don't want to configure Supabase Auth email templates/SMTP, want the invite email fully on-brand (Resend), and refuse to ship a service-role key. Also good for "issue an account setup link" flows generally.

## The shape

1. **Token store in a `private` schema** (not exposed to PostgREST):
   `private.admin_invites(token text primary key, user_id uuid, email text, expires_at timestamptz, used_at timestamptz)`.
   Token = `'inv_' || encode(gen_random_bytes(24),'hex')` — unguessable, single-use.
2. **`set_admin_password(p_token text, p_password text)` — `SECURITY DEFINER`**, `search_path` pinned:
   - look up an unused, unexpired invite by token; if none → `raise exception 'invalid_or_expired'`.
   - set the password on the matching `auth.users` row (`crypt(p_password, gen_salt('bf'))` into `encrypted_password`) — this is why it must be a definer function owned by a role that can touch `auth.users`.
   - mark the invite `used_at = now()`; ensure a `public.admin_users` row exists.
   - `returns text` (the email, so the client can show "signed in as …").
3. **Redeem from a server action** — plain server client, no secret in the browser:

```ts
"use server";
const { data, error } = await supabase.rpc("set_admin_password", { p_token: token, p_password: password });
if (error?.message?.includes("invalid_or_expired"))
  return { ok: false, message: "This setup link has expired or was already used." };
return { ok: true, email: data as string };
```

4. **Branded invite email** — a standalone Resend script (run once at provisioning) posts the `/welcome?token=inv_…` link inside your email shell:

```
node --env-file=.env.local scripts/send-invite.mjs "https://<host>/welcome?token=inv_..." [email] [name]
```

5. **`/welcome`** page reads `?token=`, renders the set-password form, calls the server action, then routes to the dashboard.

## Assumes / adapt
- **The definer function needs rights on `auth.users`.** It must be owned by a role that can update `auth.users.encrypted_password`. Pin `search_path`. This is the whole reason no service-role key is needed — the privileged write is inside one audited function, not a god key in env.
- **Seed `auth.users` correctly.** If you hand-insert the auth user (rather than `auth.admin.createUser`), set EVERY GoTrue token column (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new/current`, `reauthentication_token`) to **`''` not NULL** — NULL throws `500 "Database error querying schema"` at login.
- **Tokens are random + single-use + expiring.** `gen_random_bytes`, `used_at`, `expires_at`. Never a sequential id.
- **Resend sender must be a verified domain**, or the email silently no-ops. Keep the invite HTML in sync with your transactional `shell()` (see `branded-transactional-email-shell.md`) so onboarding matches the rest.
- This is the *first* admin path; add further admins by creating the Supabase Auth user + inserting an `admin_users` row.
