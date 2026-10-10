# Draft-and-hold social post queue: markdown post-kit → `social_posts` table (idempotent seeder)

**When to reach for it:** any project that needs to load a batch of pre-written social posts (a launch calendar, a seasonal push, an evergreen queue) into a database queue **without anything auto-publishing**. The content lives in ONE human-editable markdown file (the single source of truth); a small idempotent Node script parses it and upserts rows as `status='draft'`. Publishing is a separate, owner-gated path (a cron that only ever touches rows the owner flipped to `approved`, with an autopost env flag that defaults OFF). Pairs with [`launch-social-calendar-kit.md`](launch-social-calendar-kit.md) (the markdown format this parses) and the studio's autopilot posture (draft → owner approves → cron publishes).

**Assumes / adapt:**
- Supabase (or any Postgres) reachable with a service-role key, and a Node runtime. The seeder writes service-role-only (the queue is internal ops — no anon access).
- The content kit is markdown with a stable per-post structure (`## Post N`, `**Full copy:**`, `**Hashtags:**`). If your kit differs, change only the three regexes in `parsePosts`.
- One platform per row here (`facebook`); widen `platform` + the CHECK for multi-platform.
- **The dedupe key is the whole idempotency guarantee** — pick a stable, meaningful key per post (`launch-2026-01`, `xmas-drop-03`) so a re-run updates copy in place and never double-queues. Never key on row order or a hash of the copy (editing the copy would orphan the old row).

---

## 1. The queue table (draft-and-hold ledger)

The table is an **audit + approval + idempotency ledger**, not just a spool. Every composed post is recorded here *before* any publish; the publish path stamps the result (`fb_post_id`, `published_at`, or `error`) back onto the same row. A row may live as `draft` indefinitely.

```sql
-- Migration: social_posts queue (internal ops; service-role only, no anon access).
create table public.social_posts (
  id            bigint generated always as identity primary key,
  platform      text        not null default 'facebook',
  kind          text        not null default 'weekend_roundup', -- content lane (see CHECK)
  dedupe_key    text        unique,                              -- re-run can't double-queue
  status        text        not null default 'draft',            -- draft|approved|published|failed|skipped
  message       text        not null,
  link_url      text,
  -- provenance / result
  event_ids     bigint[],                                        -- source rows referenced (optional)
  fb_post_id    text,                                            -- platform id once published
  error         text,
  scheduled_for timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint social_posts_platform_check check (platform in ('facebook')),
  constraint social_posts_status_check
    check (status in ('draft','approved','published','failed','skipped')),
  constraint social_posts_kind_check
    check (kind in ('weekend_roundup','standout_event','manual'))
);

create index social_posts_status_created_idx
  on public.social_posts (status, created_at desc);

create trigger social_posts_set_updated_at
  before update on public.social_posts
  for each row execute function public.set_updated_at();

-- Internal ops only: RLS on, no grant, no policy → anon/authenticated get nothing.
alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon, authenticated;
```

### The status machine (the safety of the whole thing)
```
draft ──(owner approves in /admin)──> approved ──(cron publishes)──> published
                                                                 └──> failed  (error stamped, retryable)
  └──(owner skips)──> skipped
```
- The seeder only ever writes `draft`. It CANNOT cause a publish.
- The cron/publish path selects **only** `status='approved'` rows, and is itself gated behind `SOCIAL_AUTOPOST_ENABLED` (default OFF). Two independent locks (autopost flag + human approval) stand between "seeded" and "posted."
- `dedupe_key UNIQUE` makes the whole pipeline idempotent: a re-seed, a retried cron, or a double-run can't produce a duplicate post.

### Widening content lanes later = migrate the CHECK in lockstep with the code
Adding content lanes (`featured_spotlight`, `new_this_week`, `community_reshare`, …) means the `kind` CHECK and the code's `kind` union move **together, in the same change** — an insert of a new kind against the old CHECK 500s silently, and no in-code test catches it (the validator you already widened passes; only a live insert fails). See STANDARDS "Widening a set/length that a DB constraint ALSO enforces."

```sql
-- Idempotent widen migration.
alter table public.social_posts drop constraint if exists social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check
  check (kind in ('weekend_roundup','standout_event','featured_spotlight',
                  'new_this_week','community_reshare','manual'));
```

---

## 2. The seeder (`scripts/seed-social.mjs`) — parse markdown, upsert on `dedupe_key`

Generalized, dependency-light (only `@supabase/supabase-js`). Reads env from `.env.local` itself so it runs as a plain `node scripts/seed-social.mjs` with no dotenv/build step.

```js
/**
 * SEED THE SOCIAL QUEUE — <post-kit>.md -> public.social_posts.
 * Parses the posts from the markdown (single source of truth) and upserts them
 * as status='draft' (draft-and-hold). Nothing auto-publishes.
 * Idempotent: upserts on the unique dedupe_key, so re-running updates copy in
 * place and never double-queues.  Usage:  node scripts/seed-social.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader (strips wrapping quotes; never clobbers real env).
function loadEnvLocal() {
  let raw = "";
  try { raw = readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("="); if (eq === -1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// Per-post metadata keyed by post number. `kind` MUST satisfy the DB CHECK.
// Times are stored UTC — convert from the audience's local zone at author time
// (don't store local strings; the row is timestamptz).
const META = {
  1: { kind: "manual",            when: "2026-07-15T22:30:00Z" },
  2: { kind: "weekend_roundup",   when: "2026-07-16T16:00:00Z" },
  // ... one entry per post ...
};
const LINK_URL = "https://example.com";
const KEY_PREFIX = "launch-2026-"; // dedupe_key = KEY_PREFIX + zero-padded N

/** Parse the markdown into { n, message } for each "## Post N" section. */
function parsePosts(md) {
  const posts = [];
  const sections = md.split(/\n## Post (\d+)\b/); // [preamble, n, body, n, body, ...]
  for (let i = 1; i < sections.length; i += 2) {
    const n = Number(sections[i]);
    const body = sections[i + 1] ?? "";
    const copyMatch = body.match(/\*\*Full copy:\*\*\s*\n([\s\S]*?)\n\*\*Hashtags:\*\*/);
    const tagsMatch = body.match(/\*\*Hashtags:\*\*\s*(.+)/);
    if (!copyMatch) continue;
    const copy = copyMatch[1].trim();
    const tags = tagsMatch ? tagsMatch[1].trim() : "";
    posts.push({ n, message: tags ? `${copy}\n\n${tags}` : copy });
  }
  return posts.sort((a, b) => a.n - b.n);
}

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) { console.error("[seed] Missing Supabase env."); process.exitCode = 1; return; }

  const md = readFileSync(join(ROOT, "docs", "social", "launch-14-posts.md"), "utf8");
  const posts = parsePosts(md);
  const EXPECTED = Object.keys(META).length;
  if (posts.length !== EXPECTED) {           // fail loud on a parse mismatch
    console.error(`[seed] Expected ${EXPECTED} posts, parsed ${posts.length}. Aborting.`);
    process.exitCode = 1; return;
  }

  const rows = posts.map(({ n, message }) => {
    const meta = META[n];
    if (!meta) throw new Error(`No META for post ${n}`);
    return {
      platform: "facebook",
      kind: meta.kind,
      dedupe_key: `${KEY_PREFIX}${String(n).padStart(2, "0")}`,
      status: "draft",                        // draft-and-hold — never 'approved' from a seeder
      message,
      link_url: LINK_URL,
      scheduled_for: meta.when,
    };
  });

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("social_posts")
    .upsert(rows, { onConflict: "dedupe_key" })   // idempotent: update-in-place on re-run
    .select("id, dedupe_key, kind, scheduled_for, status");
  if (error) { console.error(`[seed] upsert failed: ${error.message}`); process.exitCode = 1; return; }

  console.log(`[seed] Upserted ${data.length} draft posts (status=draft, autopost OFF).`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

### The load-bearing decisions
1. **`status:'draft'` is hard-coded in the seeder.** A seeder can NEVER emit `approved`. The only way to `approved` is a human in `/admin`. This is what makes "seed a whole launch calendar" safe to run unattended.
2. **`onConflict:'dedupe_key'` upsert = edit-in-place.** Tweak the copy in the markdown, re-run, the same rows update. No duplicates, no manual cleanup. The markdown stays the single source of truth.
3. **Fail loud on a count mismatch.** `parsePosts` returning the wrong number (a malformed header, a missing `**Full copy:**`) aborts before touching the DB — you never half-seed a calendar.
4. **Times stored UTC.** Convert from the audience's local zone once, at author time, into `META[n].when`. The row is `timestamptz`; storing a local string is a DST bug waiting to happen (and the publish cron runs in UTC — see the groom/ops note about Vercel cron UTC drift).
5. **`.trim()` every secret read** (STANDARDS) and strip wrapping quotes in the env loader — a pasted `KEY="..."` or a trailing newline otherwise breaks auth.

---

## 3. Wiring notes
- **The publish cron** (`/api/cron/social` or similar) is the *only* writer of `published`/`failed`. It: checks `SOCIAL_AUTOPOST_ENABLED` (default OFF) → selects `status='approved'` AND `scheduled_for <= now()` → posts → stamps `fb_post_id`+`published_at` (or `error`+`status='failed'`). It never reads `draft` rows. Keep the seeder and the cron in separate files with no shared "publish now" path.
- **`/admin` review** lists `draft` rows, shows the composed `message` + `scheduled_for`, and offers Approve / Skip / Edit. Approving is the single human gate.
- **Reduce blast radius:** because the queue is service-role-only with RLS-on-no-policy, a leaked anon key can't read or write it. The seeder and cron use the service key server-side; nothing client-side ever touches `social_posts`.
