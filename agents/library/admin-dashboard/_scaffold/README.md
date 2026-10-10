# Owner-dashboard starter scaffold

Copy-paste starter for the `admin-dashboard/owner-dashboard-blueprint.md` pattern. Brand-neutral: app = **Acme**, example resource = **items**. Stack = **Next.js 16 (App Router) + Supabase + Tailwind v4 + TypeScript**.

## What's inside
- **Auth + role routing** — `/login` routes owner→`/dashboard`, everyone else→`/account`.
- **Gated shell** — `proxy.ts` + `middleware.ts` refresh the session and guard `/dashboard`; the layout re-checks `is_admin()` server-side.
- **Grouped nav** — `PRIMARY` · divider · `MANAGE` · footer.
- **Overview page** — StatCards + the live-traffic island.
- **One example CRUD** — `items` list + new/edit form via Server Actions.
- **Analytics tables** — `site_visits` + `record_site_visit` + admin-only `site_traffic_stats`, plus the site-wide tracker.

## Setup (once)
```bash
npx create-next-app@latest acme --ts --app --tailwind --src-dir --eslint
cd acme
npm i @supabase/ssr @supabase/supabase-js lucide-react
# copy the src/ tree from this scaffold over your src/, and sql/ anywhere
```
1. Create a Supabase project. Put its URL + anon key in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
2. Run `sql/0001_init.sql` in the Supabase SQL editor (or via migration).
3. Create your owner user in Supabase Auth (Dashboard → Authentication → Add user, with a password), then grant admin:
   ```sql
   insert into admin_users (user_id) select id from auth.users where email = 'you@example.com';
   ```
4. `npm run dev` → sign in at `/login` → you land on `/dashboard`.

## Adapt
- Rename `items` → your resource everywhere (table, RLS, `item-actions.ts`, the `items/` route, `item-form.tsx`).
- Swap the token values in `globals.css` for your brand — everything (including the live-traffic cards and, when you add it, the Stripe Appearance) reads from these tokens.
- Set the analytics timezone in `site_traffic_stats` (`America/New_York` placeholder).
- No `service_role` key: admin writes go through RLS (`is_admin()`); if you later add anonymous privileged writes (orders after payment), use a secret-gated `SECURITY DEFINER` RPC (see `ecommerce-supabase-stripe/no-service-role-order-rpc.md`).
- For themed payments, add `ecommerce-supabase-stripe/themed-inapp-payments.md`.
