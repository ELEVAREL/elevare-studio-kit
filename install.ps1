# Elevare Studio - one-command installer for Claude Code (public edition)
#
#   irm https://raw.githubusercontent.com/ELEVAREL/elevare-studio-kit/main/install.ps1 | iex
#
# Installs the studio agents + operating docs (PLAYBOOK / STANDARDS / CRAFT /
# README / SKILLS-MAP) + the pattern library + the skills into ~/.claude, and
# wires the studio operating instructions into ~/.claude/CLAUDE.md.
# Secret-free: no keys, no vault, no private knowledge base.
# Anything already in ~/.claude/agents or ~/.claude/skills is backed up first.

$ErrorActionPreference = 'Stop'

function Say($msg, $color = 'Cyan') { Write-Host $msg -ForegroundColor $color }

Say ""
Say "============================================" 'DarkCyan'
Say "  Elevare Studio  ->  Claude Code installer" 'White'
Say "============================================" 'DarkCyan'

$home_ = if ($HOME) { $HOME } else { $env:USERPROFILE }
$claude    = Join-Path $home_ '.claude'
$agentsDst = Join-Path $claude 'agents'
$skillsDst = Join-Path $claude 'skills'
New-Item -ItemType Directory -Force -Path $claude, $agentsDst, $skillsDst | Out-Null
Say "Target: $claude" 'Gray'

# --- back up anything already there ---
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($d in @($agentsDst, $skillsDst)) {
  if ((Get-ChildItem -Path $d -Force -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
    $bak = "$d.backup-$stamp"
    Copy-Item -Path $d -Destination $bak -Recurse -Force
    Say "Backed up existing $(Split-Path $d -Leaf) -> $bak" 'Yellow'
  }
}

# --- get the studio: from a local clone if run from one, else download ---
$tmp = $null
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'agents')) -and (Test-Path (Join-Path $PSScriptRoot 'skills'))) {
  $root = $PSScriptRoot
  Say "Installing from local clone: $root" 'Cyan'
} else {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("elevare-studio-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'studio.zip'
  $url = 'https://codeload.github.com/ELEVAREL/elevare-studio-kit/zip/refs/heads/main'
  Say "Downloading studio package..." 'Cyan'
  try { $ProgressPreference = 'SilentlyContinue' } catch {}
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $root = Join-Path $tmp 'elevare-studio-kit-main'
}

# --- copy agents + skills ---
Say "Installing agents + operating docs..." 'Cyan'
Copy-Item -Path (Join-Path $root 'agents/*') -Destination $agentsDst -Recurse -Force
Say "Installing skills..." 'Cyan'
Copy-Item -Path (Join-Path $root 'skills/*') -Destination $skillsDst -Recurse -Force

# --- wire the operating instructions into CLAUDE.md (idempotent) ---
$claudeMd = Join-Path $claude 'CLAUDE.md'
$snippetPath = Join-Path $root 'STUDIO-CLAUDE-SNIPPET.md'
$marker = '# Elevare Studio'
$already = (Test-Path $claudeMd) -and (Select-String -Path $claudeMd -SimpleMatch $marker -Quiet)
if ($already) {
  Say "Studio instructions already in CLAUDE.md - left as-is." 'Yellow'
} else {
  $snippet = Get-Content $snippetPath -Raw
  Add-Content -Path $claudeMd -Value "`n$snippet"
  Say "Wrote studio operating instructions -> $claudeMd" 'Green'
}

# --- counts + cleanup ---
$agentCount = (Get-ChildItem -Path $agentsDst -Filter '*.md' -File | Measure-Object).Count
$skillCount = (Get-ChildItem -Path $skillsDst -Directory | Measure-Object).Count
if ($tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

Say ""
Say "  Done." 'Green'
Say "  $agentCount agent files + operating docs -> $agentsDst" 'Green'
Say "  $skillCount skills -> $skillsDst" 'Green'
Say ""
Say "Next:" 'White'
Say "  1. Restart Claude Code (so it picks up the new agents)." 'Gray'
Say "  2. Read the flow:  $agentsDst\PLAYBOOK.md" 'Gray'
Say "  3. Kick off any job with:  'use the delivery-lead agent to ...'" 'Gray'
Say ""
