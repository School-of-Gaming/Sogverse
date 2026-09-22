<#
.SYNOPSIS
  Tear down a /worktree-flow worktree: remove its local Supabase stack, unlink
  nested-install junctions, remove the worktree, prune, delete the branch.

.DESCRIPTION
  This is the *how* for Phase 5's teardown; worktree-flow states the obligation and
  when to run it. It exists as a script for three reasons.

  Safety. A nested-install junction is a link into the main checkout's real
  node_modules. A recursive delete follows it and empties the folder behind it —
  that has cost this repo its node_modules once. Prose can only ask the next
  session to unlink first; this script refuses to delete anything recursive while a
  reparse point is still standing, so the order cannot be got wrong.

  Cost. Teardown is the last thing a worktree session does, so it runs at that
  session's largest context, where every turn is the most expensive turn of the
  run. Nine steps of shell became nine of those turns. One call is one turn.

  Completeness. A worktree that carried migrations may own a local Supabase stack,
  and the stack outlives the directory that owns it: removing the tree first strands
  its containers and their several hundred megabytes, with nothing left on disk to
  run `down` from. So the stack goes before anything is deleted.

  Everything destructive is guarded and announced. Nothing outside the named
  worktree is touched, and the remote branch is deleted only when -DeleteRemote is
  passed at the call site, so a push is never implicit.

.PARAMETER Worktree
  The worktree: an absolute path, or the bare short name under .claude/worktrees/.

.PARAMETER Branch
  Branch to delete. Defaults to the branch the worktree has checked out.

.PARAMETER DeleteRemote
  Also delete the branch on origin, when it exists there. Off by default — a remote
  delete is a push, and the call site should say so out loud.

.PARAMETER KeepBranch
  Remove the worktree but leave the branch alone.

.PARAMETER AcceptEnvLoss
  Proceed even though the worktree's .env.local has keys the main checkout lacks.
  Without it, the script stops rather than let gitignored config die with the
  worktree.

.PARAMETER Force
  Proceed even though the worktree has uncommitted changes.

.PARAMETER DryRun
  Report what would happen and change nothing.

.EXAMPLE
  .\.claude\scripts\worktree-teardown.ps1 -Worktree gamer-creations -DeleteRemote
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Worktree,
  [string]$Branch,
  [switch]$DeleteRemote,
  [switch]$KeepBranch,
  [switch]$AcceptEnvLoss,
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  WARN $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  STOP $m" -ForegroundColor Red; exit 1 }
# A guard that stops a real run only reports on a dry run, so -DryRun can survey
# the whole teardown instead of halting at the first thing it would have refused.
function Block($m) { if ($DryRun) { Warn "would stop: $m" } else { Die $m } }

# --- Locate the main checkout ------------------------------------------------
# Anchored on the script's own location, so a run from any directory resolves the
# same repository.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (git -C $scriptDir rev-parse --show-toplevel 2>$null)
if (-not $root) { Die "not inside a git repository: $scriptDir" }
$root = $root -replace '/', '\'

# A worktree cannot tear down another worktree — git refuses, and the isolation
# guard refuses first. Fail with the reason rather than the symptom.
$commonDir = (git -C $root rev-parse --git-common-dir) -replace '/', '\'
if (-not [System.IO.Path]::IsPathRooted($commonDir)) { $commonDir = Join-Path $root $commonDir }
if ((Resolve-Path $commonDir).Path -ne (Resolve-Path (Join-Path $root '.git')).Path) {
  Die "this is a worktree, not the main checkout. Run teardown from $root's parent repository."
}

# --- Resolve and validate the target ----------------------------------------
$wtRoot = Join-Path $root '.claude\worktrees'
if ([System.IO.Path]::IsPathRooted($Worktree)) { $target = $Worktree }
else { $target = Join-Path $wtRoot $Worktree }

if (-not (Test-Path -LiteralPath $target)) { Die "no such path: $target" }
$target = (Resolve-Path -LiteralPath $target).Path

if (-not $target.StartsWith((Resolve-Path $wtRoot).Path, [StringComparison]::OrdinalIgnoreCase)) {
  Die "refusing: $target is not under .claude\worktrees\"
}

# It must be a worktree git actually knows about, not just a directory that looks
# like one — otherwise a mistyped name could aim the recursive delete anywhere
# under .claude\worktrees\.
$known = @()
$cur = $null
foreach ($line in (git -C $root worktree list --porcelain)) {
  if ($line -like 'worktree *') { $cur = ($line.Substring(9) -replace '/', '\'); $known += $cur }
  elseif ($line -like 'branch *' -and $cur -eq $target) { $script:wtBranch = $line.Substring(7) -replace '^refs/heads/', '' }
}
if ($known -notcontains $target) { Die "git does not list $target as a worktree" }

if (-not $Branch) { $Branch = $script:wtBranch }
if (-not $Branch -and -not $KeepBranch) { Warn "could not determine the worktree's branch; pass -Branch or -KeepBranch" }

Write-Host ""
Write-Host "Worktree teardown" -ForegroundColor Cyan
Write-Host "  repo      $root"
Write-Host "  worktree  $target"
Write-Host "  branch    $(if ($Branch) { $Branch } else { '(none)' })"
if ($DryRun) { Write-Host "  MODE      dry run - nothing will change" -ForegroundColor Yellow }
Write-Host ""

# --- Guard: uncommitted work -------------------------------------------------
$dirty = git -C $target status --porcelain
if ($dirty -and -not $Force) {
  Write-Host ($dirty | Select-Object -First 20 | Out-String)
  Block "the worktree has uncommitted changes (above). Commit them, or pass -Force to discard."
}
if ($dirty -and $Force) { Warn "discarding uncommitted changes (-Force)" }

# --- Guard: .env.local keys that exist only in the worktree ------------------
# It is gitignored, so anything gained here dies with the worktree. Compare keys
# only — values are secrets and do not belong in a console log.
$envMain = Join-Path $root '.env.local'
$envWt = Join-Path $target '.env.local'
if ((Test-Path $envMain) -and (Test-Path $envWt)) {
  $keys = {
    param($p)
    Get-Content $p | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
      ForEach-Object { ($_ -split '=', 2)[0].Trim() }
  }
  $onlyInWt = @(& $keys $envWt | Where-Object { (& $keys $envMain) -notcontains $_ })
  if ($onlyInWt.Count -gt 0) {
    Warn "the worktree's .env.local has keys the main checkout lacks:"
    $onlyInWt | ForEach-Object { Write-Host "         $_" }
    if (-not $AcceptEnvLoss) {
      Block "copy them into $envMain first, or pass -AcceptEnvLoss to discard them."
    }
    Warn "discarding them (-AcceptEnvLoss)"
  }
}

# --- Step 1: remove the worktree's local Supabase stack ----------------------
# A worktree that carried migrations may run its own stack (supabase/CLAUDE.md, "A
# schema-changing worktree runs its own stack"). `down` removes the containers and
# their data and restores the three .env.local values `up` replaced.
#
# It must be the WORKTREE's copy of the script: local-db.mjs derives which stack it
# owns from its own location, so the main checkout's copy would address the main
# checkout's stack instead.
#
# It runs before anything is deleted, because once the tree is gone there is
# nothing left to run `down` from, and the aside copy of the original .env.local
# values dies with it — leaving containers that only `npm run db -- list` will ever
# mention, as a stack whose worktree is missing. Safe when there is no stack:
# `down` says so and exits 0.
#
# Its two failures are not the same failure, so they are not treated alike:
#
#   exit 1  `down` ran and refused, or failed part-way through — an outcome about
#           a stack that exists. The teardown stops; the stack is fixed and the
#           teardown rerun.
#   exit 2  `down` could not run at all (no distro, wsl.exe would not spawn, a
#           missing flock). Nothing was inspected, so there is nothing to fix
#           here and no reason to hold a worktree hostage to a broken distro.
#           The teardown warns and carries on.
Write-Host "1. Local Supabase stack"
$localDb = Join-Path $target 'scripts\local-db.mjs'
if (-not (Test-Path -LiteralPath $localDb)) {
  Step "no scripts\local-db.mjs in this worktree - nothing to remove"
}
elseif ($DryRun) {
  Step "would: node $localDb down"
}
else {
  Step "node scripts\local-db.mjs down"
  node $localDb down
  if ($LASTEXITCODE -eq 2) {
    Warn "'npm run db -- down' could not run in the worktree (exit 2) - nothing was inspected or removed."
    Warn "If this worktree had a stack, it stays behind: 'npm run db -- list' will show it as one"
    Warn "whose worktree is gone, and the copy of the original .env.local values that 'down' would"
    Warn "have put back dies with the worktree. Carrying on with the teardown."
  }
  elseif ($LASTEXITCODE -ne 0) {
    Die "'npm run db -- down' failed in the worktree (exit $LASTEXITCODE). Nothing has been removed; fix the stack, then rerun."
  }
  else {
    Ok "stack removed (or there was none)"
  }
}

# --- Step 2: unlink nested-install junctions ---------------------------------
# Phase 1 junctions live at <worktree>\<packages|services>\<name>\node_modules.
# Enumerated by that exact shape rather than by a recursive walk, because a
# recursive walk is itself capable of descending the link we are here to remove.
Write-Host "2. Nested-install junctions"
$links = @()
foreach ($group in @('packages', 'services')) {
  $groupDir = Join-Path $target $group
  if (-not (Test-Path -LiteralPath $groupDir)) { continue }
  foreach ($pkg in Get-ChildItem -LiteralPath $groupDir -Directory -ErrorAction SilentlyContinue) {
    $nm = Join-Path $pkg.FullName 'node_modules'
    if (-not (Test-Path -LiteralPath $nm)) { continue }
    $item = Get-Item -LiteralPath $nm -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      $links += [pscustomobject]@{
        Link   = $nm
        Mirror = Join-Path $root "$group\$($pkg.Name)\node_modules"
      }
    }
    else {
      Warn "$nm is a real directory, not a junction - leaving it to the recursive delete"
    }
  }
}

if ($links.Count -eq 0) { Step "none found (the intended end state)" }
foreach ($l in $links) {
  Step "unlink $($l.Link)"
  if ($DryRun) { continue }
  # rmdir removes the link only; it never touches the folder on the other side.
  cmd /c rmdir "$($l.Link)"
  if (Test-Path -LiteralPath $l.Link) { Die "junction survived rmdir: $($l.Link)" }
  if (Test-Path -LiteralPath $l.Mirror) {
    $n = @(Get-ChildItem -LiteralPath $l.Mirror -Force -ErrorAction SilentlyContinue).Count
    if ($n -eq 0) { Die "the main checkout's $($l.Mirror) is now EMPTY - stopping before anything else runs." }
    Ok "main checkout intact: $($l.Mirror) ($n entries)"
  }
}

# --- Step 3: assert nothing linked remains -----------------------------------
# The load-bearing check. Anything recursive below this line runs only once every
# reparse point under the worktree is gone.
Write-Host "3. Reparse-point sweep"
$remaining = @()
foreach ($depth in @('*', '*\*', '*\*\*')) {
  $remaining += Get-ChildItem -LiteralPath $target -Filter $depth -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
}
if ($remaining.Count -gt 0) {
  $remaining | ForEach-Object { Write-Host "         $($_.FullName)" }
  Die "reparse points still present (above). Unlink them before rerunning."
}
Ok "clear - recursive deletion is safe from here"

# --- Step 4: remove the worktree ---------------------------------------------
Write-Host "4. Remove the worktree"
if ($DryRun) {
  Step "would: git worktree remove $target  (falling back to recursive delete + prune)"
}
else {
  git -C $root worktree remove $target 2>$null
  if (-not $?) {
    # Expected whenever node_modules or .next are present; git refuses a worktree
    # it considers unclean. Safe now that the sweep above passed.
    Step "git refused (build artefacts present) - deleting recursively, then pruning"
    Remove-Item -LiteralPath $target -Recurse -Force
    git -C $root worktree prune
  }
  if (Test-Path -LiteralPath $target) { Die "the worktree directory is still present: $target" }
  Ok "removed"
}

# --- Step 5: delete the branch -----------------------------------------------
Write-Host "5. Branch"
if ($KeepBranch -or -not $Branch) {
  Step "keeping $Branch"
}
else {
  if ($DryRun) {
    Step "would: git branch -D $Branch"
    if ($DeleteRemote) { Step "would: git push origin --delete $Branch" }
  }
  else {
    git -C $root branch -D $Branch
    if ($?) { Ok "deleted local $Branch" }
    if ($DeleteRemote) {
      $onRemote = git -C $root ls-remote --heads origin $Branch
      if ($onRemote) {
        git -C $root push origin --delete $Branch
        if ($?) { Ok "deleted origin/$Branch" }
      }
      else { Step "origin has no $Branch - nothing to delete" }
    }
    else { Step "leaving the remote branch alone (-DeleteRemote not passed)" }
  }
}

# --- Step 6: report -----------------------------------------------------------
Write-Host ""
Write-Host "Final state" -ForegroundColor Cyan
Write-Host "  worktree present   $(Test-Path -LiteralPath $target)"
Write-Host "  branches remaining $((git -C $root branch --list $Branch) -join ' ')"
Write-Host "  main checkout on   $(git -C $root branch --show-current)"
foreach ($group in @('packages', 'services')) {
  $groupDir = Join-Path $root $group
  if (-not (Test-Path -LiteralPath $groupDir)) { continue }
  foreach ($pkg in Get-ChildItem -LiteralPath $groupDir -Directory -ErrorAction SilentlyContinue) {
    $nm = Join-Path $pkg.FullName 'node_modules'
    if (Test-Path -LiteralPath $nm) {
      $n = @(Get-ChildItem -LiteralPath $nm -Force -ErrorAction SilentlyContinue).Count
      Write-Host "  $group\$($pkg.Name)\node_modules  $n entries"
    }
  }
}
Write-Host ""
