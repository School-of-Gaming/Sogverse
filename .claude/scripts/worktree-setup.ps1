<#
.SYNOPSIS
  Set up a /worktree-flow worktree: verify the base, create the worktree and
  branch, junction the nested installs, copy .env.local, seed the type-check
  caches. With -Existing, check out a branch that already exists instead of
  creating one.

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

  Why the type-check caches come from a sibling worktree, never the main
  checkout. A .tsbuildinfo records every file relative to itself, with a content
  hash, so a copy is reused wherever those relative paths still hold. From the
  main checkout they do not: node_modules is ./node_modules there and
  ../../../node_modules here, so every package file reads as new, every import as
  changed, and the first type-check runs as cold as with no cache at all. Every
  worktree sits at the same depth, so the newest sibling's copy lines up exactly
  and tsc rechecks only what differs between the two branches. With no sibling
  holding one, the first type-check is cold. The lint cache is not seeded: ESLint
  keys it by absolute path and hashes each entry with the config, whose
  tsconfigRootDir is absolute, so a copy from any other checkout is ignored.

.PARAMETER Name
  Short name for the worktree directory under .claude/worktrees/.

.PARAMETER Branch
  Branch to create. Defaults to feat/<Name>. The feat/ prefix is the convention;
  feature/ and bare names in the history are drift. With -Existing, the branch to
  check out instead.

.PARAMETER Base
  Base to branch from. Defaults to dev. Anything else is echoed back loudly, so a
  deliberate choice and a mistake never look alike in the transcript. Refused
  with -Existing, which has no base.

.PARAMETER SkipFetch
  Skip the fetch and the base check. For a base already known current this minute.

.PARAMETER Existing
  Check out a local branch that already exists rather than create one — a branch
  built elsewhere and picked up by a new session, or a worktree being relocated.
  The branch must exist locally and must not be checked out in any other worktree.
  There is no base to verify, so the fetch and base check are skipped; everything
  after them runs as for a new branch. Without it, a branch that already exists
  is refused.

.EXAMPLE
  .\.claude\scripts\worktree-setup.ps1 -Name gamer-creations

.EXAMPLE
  .\.claude\scripts\worktree-setup.ps1 -Name landing-clone -Existing
  Sets up .claude/worktrees/landing-clone on the existing branch feat/landing-clone.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Branch,
  [string]$Base = 'dev',
  [switch]$SkipFetch,
  [switch]$Existing
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
if ($Existing) { Write-Host "  base      (none - existing branch)" }
else {
  Write-Host "  base      $Base"
  if ($Base -ne 'dev') { Warn "base is not dev - using $Base because it was asked for" }
}
Write-Host ""

if (Test-Path -LiteralPath $target) { Die "already exists: $target" }
if ($Existing) {
  if ($PSBoundParameters.ContainsKey('Base')) { Die "-Base has no meaning with -Existing: the branch already exists" }
  if (-not (git -C $root rev-parse --verify --quiet "refs/heads/$Branch")) {
    Die "no local branch $Branch - -Existing checks out a branch that already exists. Fetch or create it first."
  }
  # git refuses a branch checked out twice; say where it is instead of git's text.
  $cur = $null
  foreach ($line in (git -C $root worktree list --porcelain)) {
    if ($line -like 'worktree *') { $cur = ($line.Substring(9) -replace '/', '\') }
    elseif ($line -eq "branch refs/heads/$Branch") { Die "$Branch is already checked out in $cur" }
  }
}
elseif (git -C $root rev-parse --verify --quiet "refs/heads/$Branch") { Die "branch already exists: $Branch" }

# --- 1. Verify the base ------------------------------------------------------
# No setting can enforce this, because no setting fetches. main trails dev by
# hundreds of commits, so a branch cut from a stale base starts life missing work
# it will later collide with.
Write-Host "1. Base"
if ($Existing) {
  Step "skipped (-Existing) - $Branch already exists, so there is no base to verify; checking it out as it stands at $(git -C $root rev-parse --short $Branch)"
}
elseif ($SkipFetch) {
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
if ($Existing) {
  git -C $root worktree add $target $Branch
  if (-not $?) { Die "git worktree add failed" }
  Ok "checked out existing $Branch at $target"
}
else {
  git -C $root worktree add $target -b $Branch $Base
  if (-not $?) { Die "git worktree add failed" }
  Ok "created $Branch at $target"
}

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

# --- 5. Seed the type-check caches -------------------------------------------
# Gitignored, so a new worktree starts cold. Each tracked tsconfig.json keeps its
# cache beside it as tsconfig.tsbuildinfo when it is incremental; the newest
# sibling worktree's copy is the donor (the header says why not the main checkout).
Write-Host "5. Type-check caches"
$siblings = @(Get-ChildItem -LiteralPath (Join-Path $root '.claude\worktrees') -Directory |
  Where-Object { $_.FullName -ne $target })
$seeded = 0
foreach ($config in (git -C $target ls-files -- '*tsconfig*.json')) {
  $rel = ($config -replace '/', '\') -replace '\.json$', '.tsbuildinfo'
  $donor = $siblings |
    ForEach-Object { Join-Path $_.FullName $rel } |
    Where-Object { Test-Path -LiteralPath $_ } |
    ForEach-Object { Get-Item -LiteralPath $_ } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $donor) { continue }
  Copy-Item -LiteralPath $donor.FullName -Destination (Join-Path $target $rel)
  $from = $donor.FullName.Substring($root.Length + '\.claude\worktrees\'.Length).Split('\')[0]
  Ok "seeded $rel from $from"
  $seeded++
}
if ($seeded -eq 0) { Step "none seeded (no sibling worktree has run a type-check) - the first type-check runs cold" }

# --- 6. Hand back what Phase 1 needs next ------------------------------------
Write-Host ""
Write-Host "Next: EnterWorktree with path set to" -ForegroundColor Cyan
Write-Host "  $target"
Write-Host "(pass path, never name - name branches from worktree.baseRef, which is unset and defaults to origin/main)"
Write-Host ""
