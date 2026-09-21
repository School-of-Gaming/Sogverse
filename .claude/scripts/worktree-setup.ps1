<#
.SYNOPSIS
  Set up a /worktree-flow worktree: verify the base, create the worktree and
  branch, junction the nested installs, copy .env.local.

.DESCRIPTION
  This is the *how* for Phase 1; worktree-flow states the obligations and when to
  run it. The reasoning that used to live in that phase's prose lives here, next
  to the commands it governs.

  Why the worktree goes under .claude/worktrees/. It is gitignored, and because it
  sits inside the checkout, Node resolves node_modules upward from the parent — so
  no npm install is needed, saving several minutes and a gigabyte. Three things
  make the nested location safe: the gitignore; lint and tests targeting explicit
  directories that never reach into .claude/; and the root tsconfig.json listing
  ".claude" in its exclude. Without that exclude the parent checkout type-checks
  worktree files against its own branch's @/* resolution and reports phantom
  errors at .claude/worktrees/... paths. If those ever appear on a clean parent
  branch, the exclude has been dropped — restore it rather than debug the worktree.

  Why the junctions. Upward resolution stops at the root, so a workspace package
  pinning a dependency at a different version from the root has its own copy under
  packages/<name>/node_modules, which the worktree lacks — Node then walks past to
  the root's copy, the wrong version. It fails only where that package loads, and
  it reads as a code error rather than an environment one: a missing export from a
  symbol the main checkout and CI both resolve. No package pins a split version
  today, so this is insurance rather than a live fault; it runs anyway, because
  the day one appears is the day the failure is hardest to read.

  The one case this script cannot cover: a branch that will change dependencies.
  Upward resolution hands the worktree the main checkout's install, so a branch
  editing package.json or package-lock.json runs against the wrong tree. Run
  npm install inside the worktree after that change lands, and only then.

.PARAMETER Name
  Short name for the worktree directory under .claude/worktrees/.

.PARAMETER Branch
  Branch to create. Defaults to feat/<Name>. The feat/ prefix is the convention;
  feature/ and bare names in the history are drift.

.PARAMETER Base
  Base to branch from. Defaults to dev. Anything else is echoed back loudly, so a
  deliberate choice and a mistake never look alike in the transcript.

.PARAMETER SkipFetch
  Skip the fetch and the base check. For a base already known current this minute.

.EXAMPLE
  .\.claude\scripts\worktree-setup.ps1 -Name gamer-creations
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Branch,
  [string]$Base = 'dev',
  [switch]$SkipFetch
)

$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  WARN $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  STOP $m" -ForegroundColor Red; exit 1 }

# --- Locate the main checkout ------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (git -C $scriptDir rev-parse --show-toplevel 2>$null)
if (-not $root) { Die "not inside a git repository: $scriptDir" }
$root = $root -replace '/', '\'

# A worktree-isolated session cannot create another worktree; the isolation guard
# refuses. Fail with the reason rather than the symptom.
$commonDir = (git -C $root rev-parse --git-common-dir) -replace '/', '\'
if (-not [System.IO.Path]::IsPathRooted($commonDir)) { $commonDir = Join-Path $root $commonDir }
if ((Resolve-Path $commonDir).Path -ne (Resolve-Path (Join-Path $root '.git')).Path) {
  Die "this is a worktree, not the main checkout. Run setup from the main checkout."
}

if (-not $Branch) { $Branch = "feat/$Name" }
$target = Join-Path $root ".claude\worktrees\$Name"

Write-Host ""
Write-Host "Worktree setup" -ForegroundColor Cyan
Write-Host "  repo      $root"
Write-Host "  worktree  $target"
Write-Host "  branch    $Branch"
Write-Host "  base      $Base"
if ($Base -ne 'dev') { Warn "base is not dev - using $Base because it was asked for" }
Write-Host ""

if (Test-Path -LiteralPath $target) { Die "already exists: $target" }
if (git -C $root rev-parse --verify --quiet "refs/heads/$Branch") { Die "branch already exists: $Branch" }

# --- 1. Verify the base ------------------------------------------------------
# No setting can enforce this, because no setting fetches. main trails dev by
# hundreds of commits, so a branch cut from a stale base starts life missing work
# it will later collide with.
Write-Host "1. Base"
if ($SkipFetch) {
  Warn "skipping the fetch (-SkipFetch) - $Base is assumed current"
}
else {
  git -C $root fetch origin $Base
  if (-not $?) { Die "could not fetch origin/$Base" }
  $local = git -C $root rev-parse $Base
  $remote = git -C $root rev-parse "origin/$Base"
  if ($local -ne $remote) {
    $behind = git -C $root rev-list --count "$Base..origin/$Base"
    $ahead = git -C $root rev-list --count "origin/$Base..$Base"
    # Ahead is not a hazard - a branch cut from it simply carries the local
    # commits too, and on dev an unpushed commit is work already declared ready.
    # Behind is the hazard. Both at once is a genuine divergence and stops here.
    if ($ahead -ne '0' -and $behind -ne '0') {
      Die "local $Base has diverged from origin/$Base ($ahead ahead, $behind behind). Reconcile it before branching."
    }
    if ($ahead -ne '0') {
      Warn "local $Base is $ahead commit(s) ahead of origin/$Base - branching from the local tip, which carries them"
    }
    if ($behind -ne '0') {
      Step "local $Base is $behind commit(s) behind - fast-forwarding"
      $onBranch = git -C $root branch --show-current
      if ($onBranch -eq $Base) { git -C $root merge --ff-only "origin/$Base" }
      else { git -C $root fetch origin "${Base}:${Base}" }
      if (-not $?) { Die "could not fast-forward $Base" }
    }
  }
  Ok "branching from $Base at $(git -C $root rev-parse --short $Base)"
}

# --- 2. Create the worktree --------------------------------------------------
Write-Host "2. Worktree"
git -C $root worktree add $target -b $Branch $Base
if (-not $?) { Die "git worktree add failed" }
Ok "created $Branch at $target"

# --- 3. Junction the nested installs -----------------------------------------
Write-Host "3. Nested installs"
$made = 0
foreach ($group in @('packages', 'services')) {
  $groupDir = Join-Path $root $group
  if (-not (Test-Path -LiteralPath $groupDir)) { continue }
  foreach ($pkg in Get-ChildItem -LiteralPath $groupDir -Directory -ErrorAction SilentlyContinue) {
    $source = Join-Path $pkg.FullName 'node_modules'
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $link = Join-Path $target "$group\$($pkg.Name)\node_modules"
    if (Test-Path -LiteralPath $link) { Step "already present: $group\$($pkg.Name)"; continue }
    $parent = Split-Path -Parent $link
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    New-Item -ItemType Junction -Path $link -Target $source | Out-Null
    Ok "junctioned $group\$($pkg.Name)\node_modules"
    $made++
  }
}
if ($made -eq 0) { Step "none needed (no package has a nested install - the intended end state)" }

# --- 4. Copy .env.local ------------------------------------------------------
# Gitignored, so without it the app boots and silently cannot reach Supabase.
Write-Host "4. Environment"
$envMain = Join-Path $root '.env.local'
if (Test-Path -LiteralPath $envMain) {
  Copy-Item -LiteralPath $envMain -Destination (Join-Path $target '.env.local')
  Ok "copied .env.local"
}
else { Warn "no .env.local in the main checkout - the app will not reach Supabase" }

# --- 5. Hand back what Phase 1 needs next ------------------------------------
Write-Host ""
Write-Host "Next: EnterWorktree with path set to" -ForegroundColor Cyan
Write-Host "  $target"
Write-Host "(pass path, never name - name branches from worktree.baseRef, which is unset and defaults to origin/main)"
Write-Host ""
