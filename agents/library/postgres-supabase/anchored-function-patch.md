# Extend a shared Postgres function IN PLACE — never body-copy it in a parallel wave

`create or replace function f() ... $$ <pasted body> $$` is correct **exactly once**: against a
database where nothing has touched `f` since the migration you copied the body from. In a parallel
wave it **silently deletes every branch any other lane added in the meantime**. No error, no
conflict, no diff anyone reads — the other lane's feature simply stops working, and its migration
still shows as applied.

## When to reach for it
- Two or more migrations in one wave must each add a branch to the **same shared function** — a push
  dispatcher's per-kind `CASE`, a permission helper, an event router, a search-vector builder, an
  audit trigger.
- You are writing a migration against a function whose current live body you did not write.
- Your migration will sit unapplied for a while (a lane blocked on review) while other migration
  numbers land ahead of it. This is the case that bites: your body snapshot was accurate the day you
  took it and is stale by the time it runs.

**The tell:** you are about to paste a function body you did not author into your migration. Stop.

## The recipe: an anchored substitution helper that fails closed

Read the function's *current* definition out of the catalog with `pg_get_functiondef`, substitute one
anchored literal, execute the result, and read it back to confirm. Give the helper a name carrying
your migration number so two lanes' helpers never collide, and drop it at the end of the section.

```sql
create or replace function public.patch_fn_0025(
  p_fn text, p_find text, p_replace text, p_marker text
) returns text language plpgsql set search_path = '' as $patch$
declare
  v_oid   regprocedure;
  v_def   text;
  v_check text;
  v_hits  int;
begin
  v_oid := to_regprocedure(p_fn);
  if v_oid is null then
    raise exception '0025: function % not found. It is a prerequisite of this migration.', p_fn;
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- Idempotent: re-running this migration is a no-op, not a double edit.
  if position(p_marker in v_def) > 0 then
    raise notice '0025: % already carries "%" — left untouched.', p_fn, p_marker;
    return 'already-present';
  end if;

  -- Exactly-once anchor. Zero hits means the anchor drifted; two means it is ambiguous.
  v_hits := (length(v_def) - length(replace(v_def, p_find, ''))) / length(p_find);
  if v_hits <> 1 then
    raise exception '0025: refusing to patch % — anchor "%" appears % times, expected exactly once. '
                    'Someone has reshaped this function; re-derive the anchor by hand.',
                    p_fn, p_find, v_hits;
  end if;

  execute replace(v_def, p_find, p_replace);

  -- "It applied" is not evidence. Read it back and confirm the marker is really there.
  v_check := pg_get_functiondef(to_regprocedure(p_fn));
  if position(p_marker in v_check) = 0 then
    raise exception '0025: patched % but the marker "%" is absent when read back.', p_fn, p_marker;
  end if;
  raise notice '0025: patched % (marker "%").', p_fn, p_marker;
  return 'patched';
end $patch$;
revoke all on function public.patch_fn_0025(text, text, text, text)
  from public, anon, authenticated;

select public.patch_fn_0025(
  'public.push_queue(integer)',
  'when n.kind in (''comment_new'',''reply_new'') then pr.comments',
  'when n.kind in (''comment_new'',''reply_new'') then pr.comments
           when n.kind = ''repost_new'' then pr.reposts',
  'n.kind = ''repost_new'''
);

drop function public.patch_fn_0025(text, text, text, text);
```

## The four things that make it safe
1. **Unknown function → exception.** A missing prerequisite is a loud failure, not a skipped patch.
2. **Anchor must appear EXACTLY ONCE.** Zero means someone reshaped the function and your anchor is
   stale; two means the substitution is ambiguous and would pick one arbitrarily. Both are errors.
3. **Marker check on read-back.** `execute` returning without error is not evidence the edit landed;
   re-read the definition and assert the new text is present.
4. **Marker check up front → idempotent.** Re-running the migration is a no-op. This matters because
   a migration that is not idempotent cannot be safely re-applied after a partial failure.

## Two rules that are easy to miss

**No `revoke` / `grant` lines follow the patch.** `create or replace function` **does not reset
ACLs**, so the patched function keeps exactly the privileges it already had. Re-issuing a `revoke all
... from public, anon, authenticated` after patching strips any grant another lane legitimately
added — the same clobber class as the body copy, one layer down.

**Choose an anchor that a peer lane will not also anchor on.** Two lanes patching the same function
compose in either order *only if* each anchors on a different, stable line. Pick the arm your branch
logically belongs next to, and say in a comment which line you chose and why, so the next lane picks
a different one.

## The consumer-side twin
A test that wants to know a shared function's *effective* body cannot read "the last `create or
replace` by filename order" — that stops at the last full definition and never learns about the
anchored patches after it. It must **replay**: start at the last full definition and apply every
later anchored mutation in order, exactly the way Postgres got there. See
[`../verification/cross-layer-enum-contract-gate.md`](../verification/cross-layer-enum-contract-gate.md),
which implements that replay and fails closed on any mutation shape it does not recognise.

## Assumes / adapt
- Postgres with `pg_get_functiondef` — i.e. any supported version. Supabase-compatible.
- Assumes the migration runner applies files in filename order and that migration numbers were
  **pre-assigned per lane** before fan-out (see
  [`../orchestration/parallel-fix-wave.md`](../orchestration/parallel-fix-wave.md)); agents left to
  pick their own number all converge on the next free integer.
- The helper takes plain-text `find`/`replace`. Whitespace inside the anchor must match the catalog's
  formatting of the function, which is `pg_get_functiondef`'s normalization — not necessarily your
  source file's. Take the anchor from a live `pg_get_functiondef` read, not from the migration file.
- Verify the live body before writing the patch (`select md5(prosrc), length(prosrc) from pg_proc
  where oid = 'public.f(int)'::regprocedure`) and record that hash in a comment. It is a snapshot
  with a shelf life — which is exactly why the patch, not the snapshot, is what ships.

*Harvested from the Whyza reposts wave, `supabase/migrations/0025_reposts.sql` §6 (2026-09-06), where
the first draft body-copied a dispatcher that three later lanes had already extended.*
