---
name: cinematic-ad-higgsfield
description: Produce a premium, cinematic / motion-design ad the "@builtbystephan" way — pull references, storyboard N scenes, generate each scene as a still with Higgsfield (GPT Image / Nano Banana), animate each still to motion with Seedance 2.0, then assemble into a scored 9:16 (or 16:9 / 1:1) reel. Use for brand films, product ads, teaser reels, and scroll-stopping social ads for Elevare or client companies. This is the Higgsfield-native path; for built-from-scratch React/HTML kinetic-type ads use motion-ad-director's remotion/huashu path instead.
origin: Reverse-engineered from the "Motion design is now automated" pipeline (Claude Code + Higgsfield MCP → storyboard → GPT Images → Seedance 2.0). Companion: [[studio-print-and-video-ad-pipeline]].
tools: Read, Write, Edit, Bash
---

# Cinematic / motion-design ad via Higgsfield

One pipeline, agency-quality output, no agency. Conductor: **motion-ad-director**; generation owned by **ai-media-producer** (Higgsfield MCP). Read `~/.claude/agents/CRAFT.md` (Motion + Anti-slop) first — the bar is Awwwards / Apple-keynote, one idea per scene, one real wow moment.

## The pipeline (mirrors the reference exactly)

**1. Brief → direction.** One product/brand, one feeling, one CTA. Get the real brand tokens (logo, palette, type, voice) from the live site or brand kit — never design from memory. For a client, confirm what they supply (product shots, logo).

**2. Pull references (design-researcher).** Search Pinterest/Behance/the web for 6–12 frames in the target aesthetic. Name the visual direction in one line (e.g. "editorial ink-wash, paper texture, high-contrast title cards"). This is the style key that locks every scene's look.

**3. Storyboard N scenes (motion-ad-director + conversion-copywriter).** Default 6 shots for a ~30–45s reel. Each shot = one line: subject, composition, camera, the on-screen word/line. Pin a **beat skeleton** (hook in shot 1's first 0.5s → escalate → payoff → CTA). Copy comes from conversion-copywriter — never invent claims. Write the storyboard to `storyboard.md`.

**4. Generate each scene as a STILL (ai-media-producer → Higgsfield `generate_image`).**
   - Model default: **GPT Image 2** for designed/text-in-image scenes; **Nano Banana 2/Pro** for character/reference-consistent scenes. Ask `models_explore(action:'recommend')` with the shot's goal if unsure.
   - One prompt per shot, carrying the style key so all 6 share a look. Generate 2–3 variants per shot, pick the best (the "Pick the one you like" step).
   - For a real product/logo, pass it as a reference image (`--image` / reference elements) so the product is faithful. For a recurring character/face, chain `higgsfield-soul-id` for identity consistency.
   - Aspect ratio: author at the delivery ratio (9:16 social default; also 1:1 / 16:9). Save stills to `scenes/shotN.png`.

**5. Animate each still to MOTION (ai-media-producer → Higgsfield `generate_video`, Seedance 2.0).**
   - Image-to-video per shot: feed `shotN.png` + a motion prompt (camera move + subject motion — "slow push in, ink bleeds outward, cloth drifts"). Keep moves deliberate; one motion idea per shot.
   - ~5–10s per shot → trim to the beat. Use `motion_control` for precise camera/motion transfer when a shot needs an exact move; `reframe` to retarget an aspect ratio without regenerating.

**6. Score + assemble.**
   - Music: `generate_audio` (Seed Audio) for an original bed, or a licensed track — pin the beat so cuts land on it (this ad has no VO; music + kinetic type carry it).
   - Assemble the N clips + title cards in order (ffmpeg for a fast cut; motion-ad-director's remotion/huashu path if the title typography needs frame-accurate kinetic type over the footage). Add the brand logo sting + CTA end card. `upscale_video` to 2K/4K for the hero deliverable.
   - Ship 9:16 primary + `reframe` to 1:1 and 16:9 so one production feeds every placement.

## Quality gates (before ship)
- **art-director** taste gate — does it stop the scroll, is it one idea, is the wow real (not "text over gradient")?
- Brand fidelity — real tokens, product/logo faithful, claims approved by conversion-copywriter/human.
- Motion sanity — no morphing artifacts on faces/hands/product, cuts land on the beat, first 0.5s hooks.
- Deliver into the marketing gallery ([[marketing-asset-gallery-staple]]) + the owner's Drive.

## Guardrails
- **Generation spends Higgsfield credits — confirm the brief + get owner sign-off before a full N-scene render.** Prototype ONE hero shot (still → 1 animated clip) first, approve the look, then batch the rest. Don't render 6 scenes ×3 variants blind.
- Publishing/posting the ad is a human sign-off gate (PLAYBOOK) — the studio stages the finished reel; the owner posts.
- Client work: only use client-supplied or licensed assets; faithful product/logo; no invented claims or fake testimonials.
- On an Apps-UI client, use `media_upload_widget` for the owner's local product photos (remote MCP can't read chat attachments).

## Selling it (other companies)
This is a productized offer (playbook L): "cinematic brand reel / product ad, storyboard → delivered in a day." Price per reel or as a content retainer; the same pipeline scales across clients. Feeds lead-gen (make a spec ad for a prospect's product) and the marketing engine (Elevare's own reels). Emit `stage:*`/`handoff` events to the live feed so the owner can watch a reel get built.
