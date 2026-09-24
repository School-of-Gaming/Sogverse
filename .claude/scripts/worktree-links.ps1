<#
.SYNOPSIS
  Delete a directory tree without following any link inside it. Dot-sourced by
  worktree-teardown.ps1, and kept apart from it so the same functions can be run
  against a throwaway tree.

.DESCRIPTION
  A directory junction or symlink inside a tree is a doorway to a folder outside
  it, and a recursive delete that steps through one empties that folder. Git for
  Windows' `git worktree remove` steps through; whether any other recursive
  delete does depends on its version, so these functions never rely on one:

    Find-TreeLinks        walks the tree and records every reparse point in it,
                          checking each entry's attributes before recursing, so the
                          walk itself never descends through a link.
    Remove-TreeLinks      unlinks each one without touching what it points at,
                          then walks again and throws if any is still standing.
    Remove-TreeNoFollow   deletes what is left with `rmdir /s /q`, which removes a
                          junction it meets instead of traversing it.
    Test-LinkTargets      confirms every folder a link pointed at from outside the
                          tree still exists and is not empty.

  Every function throws on failure rather than printing and carrying on; the
  caller decides whether that stops a run.
#>

function Test-FsEntry([string]$Path) {
  # Test-Path reports a junction whose target is missing as absent; these two
  # read the link's own attributes and see it.
  [IO.Directory]::Exists($Path) -or [IO.File]::Exists($Path)
}

function Get-EntryCount([string]$Path) {
  if (-not [IO.Directory]::Exists($Path)) { return -1 }
  @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue).Count
}

function Get-LinkTarget([string]$Path) {
  try { $t = @((Get-Item -LiteralPath $Path -Force).Target)[0] } catch { return $null }
  if (-not $t) { return $null }
  if (-not [IO.Path]::IsPathRooted($t)) { $t = Join-Path (Split-Path -Parent $Path) $t }
  [IO.Path]::GetFullPath($t)
}

function Find-TreeLinks {
  param([Parameter(Mandatory = $true)][string]$Root)

  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $rootInfo = [IO.DirectoryInfo]::new($rootFull)
  if ($rootInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "$rootFull is itself a link; refusing to walk it"
  }

  $links = New-Object System.Collections.Generic.List[object]
  $unreadable = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($rootFull)

  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    try { $entries = [IO.DirectoryInfo]::new($dir).GetFileSystemInfos() }
    catch { $unreadable.Add("$dir  ($($_.Exception.Message))"); continue }

    foreach ($e in $entries) {
      # A worktree's .git is a file; skipped by name so a main-checkout-shaped
      # tree is not walked through its object store either.
      if ($dir -eq $rootFull -and $e.Name -eq '.git') { continue }

      if ($e.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $target = Get-LinkTarget $e.FullName
        $outside = $target -and -not ($target + '\').StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)
        $links.Add([pscustomobject]@{
          Path          = $e.FullName
          IsDirectory   = [bool]($e -is [IO.DirectoryInfo])
          Target        = $target
          TargetOutside = [bool]$outside
          TargetEntries = if ($outside) { Get-EntryCount $target } else { $null }
        })
        continue
      }
      if ($e -is [IO.DirectoryInfo]) { $stack.Push($e.FullName) }
    }
  }

  [pscustomobject]@{ Links = $links.ToArray(); Unreadable = $unreadable.ToArray() }
}

function Remove-TreeLink {
  param([Parameter(Mandatory = $true)]$Link)
  if ($Link.IsDirectory) {
    # rmdir without /s removes the link itself; it never reads the folder behind it.
    $out = cmd /c rmdir "$($Link.Path)" 2>&1
  }
  else {
    [IO.File]::Delete($Link.Path)
  }
  if (Test-FsEntry $Link.Path) { throw "link survived removal: $($Link.Path) $out" }
}

function Remove-TreeLinks {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Links
  )
  foreach ($l in $Links) { Remove-TreeLink $l }

  # The load-bearing check: nothing recursive runs until a fresh walk agrees
  # nothing linked is left, including anything created since the first walk.
  $again = Find-TreeLinks -Root $Root
  if ($again.Links.Count -gt 0) {
    throw "links still present after unlinking:`n  " + (($again.Links | ForEach-Object Path) -join "`n  ")
  }
  if ($again.Unreadable.Count -gt 0) {
    throw "directories that could not be read, so could not be checked for links:`n  " + ($again.Unreadable -join "`n  ")
  }
}

function Remove-TreeNoFollow {
  param([Parameter(Mandatory = $true)][string]$Root)
  $out = cmd /c rmdir /s /q "$Root" 2>&1
  if (Test-FsEntry $Root) { throw "directory still present after rmdir /s /q: $Root $out" }
}

function Test-LinkTargets {
  # Returns one line per outside target that is now missing or empty; empty
  # output means every one survived.
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Links)
  foreach ($l in $Links | Where-Object { $_.TargetOutside -and $_.TargetEntries -gt 0 }) {
    $n = Get-EntryCount $l.Target
    if ($n -lt 0) { "MISSING  $($l.Target)  (was $($l.TargetEntries) entries; linked from $($l.Path))" }
    elseif ($n -eq 0) { "EMPTY    $($l.Target)  (was $($l.TargetEntries) entries; linked from $($l.Path))" }
  }
}
