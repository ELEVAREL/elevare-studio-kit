# Elevare Studio kit

The Elevare Studio agent team and skills library for Claude Code: specialist agents (delivery lead, designers, engineers, marketers, QA and security gates), the operating playbook they follow, a pattern library, and the installed skills.

## Install (Windows, PowerShell)

```powershell
irm https://raw.githubusercontent.com/ELEVAREL/elevare-studio-kit/main/install.ps1 | iex
```

Then restart Claude Code and start any job with "use the delivery-lead agent to ...".

What it does:
- copies `agents/` to `~/.claude/agents` and `skills/` to `~/.claude/skills` (anything already there is backed up first)
- adds the studio operating instructions to `~/.claude/CLAUDE.md` once

## What is in here
- `agents/` — agent definitions plus `PLAYBOOK.md`, `STANDARDS.md`, `CRAFT.md`, `SKILLS-MAP.md` and the `library/` of reusable patterns
- `skills/` — the skills the agents use
- `install.ps1` — the installer above

Secret-free: no API keys, no key vault, no private client data.
