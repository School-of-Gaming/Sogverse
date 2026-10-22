<#
.SYNOPSIS
  Which processes have their current directory inside a folder.

.DESCRIPTION
  Dot-sourced by worktree-teardown.ps1. A folder that is empty and still refuses
  to be deleted ("being used by another process") is almost always some process's
  current directory, and Windows offers no command that says whose. So this reads
  each process's current directory out of its own memory (the process parameters
  in its PEB), which is what a handle viewer does for the same question.

  Only 64-bit processes are read; a 32-bit one keeps its parameters at other
  offsets and is skipped, as is any process this user may not open.
#>

if (-not ('ProcessCwd' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ProcessCwd {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr h, out bool wow);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, ref Info info, int len, out int ret);
  [StructLayout(LayoutKind.Sequential)] struct Info { public IntPtr R1; public IntPtr Peb; public IntPtr R2a; public IntPtr R2b; public IntPtr Pid; public IntPtr R3; }
  static long ReadPtr(IntPtr h, long addr) {
    var b = new byte[8]; IntPtr r;
    return ReadProcessMemory(h, new IntPtr(addr), b, 8, out r) ? BitConverter.ToInt64(b, 0) : 0;
  }
  // PROCESS_QUERY_INFORMATION | PROCESS_VM_READ; PEB+0x20 is ProcessParameters,
  // and CurrentDirectory.DosPath is the UNICODE_STRING at +0x38 within it.
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      bool wow; IsWow64Process(h, out wow); if (wow) return null;
      var info = new Info(); int ret;
      if (NtQueryInformationProcess(h, 0, ref info, Marshal.SizeOf(info), out ret) != 0) return null;
      long pp = ReadPtr(h, info.Peb.ToInt64() + 0x20);
      if (pp == 0) return null;
      var lenb = new byte[2]; IntPtr r;
      if (!ReadProcessMemory(h, new IntPtr(pp + 0x38), lenb, 2, out r)) return null;
      int len = BitConverter.ToUInt16(lenb, 0);
      long buf = ReadPtr(h, pp + 0x40);
      var s = new byte[len];
      if (buf == 0 || !ReadProcessMemory(h, new IntPtr(buf), s, len, out r)) return null;
      return Encoding.Unicode.GetString(s);
    } finally { CloseHandle(h); }
  }
}
"@
}

# Every process whose current directory is $Root or below it, with what a
# caller needs to decide about it: its name, its parent's name, and whether it
# is running anything (a child other than the console host every console
# process gets).
function Get-ProcessesInDirectory([string]$Root) {
  $prefix = $Root.TrimEnd('\') + '\'
  $all = @(Get-CimInstance Win32_Process)
  $byId = @{}
  foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  foreach ($p in $all) {
    $id = [int]$p.ProcessId
    if ($id -eq $PID) { continue }
    $cwd = $null
    try { $cwd = [ProcessCwd]::Get($id) } catch { }
    if (-not $cwd) { continue }
    if (-not ($cwd.TrimEnd('\') + '\').StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { continue }
    $parent = $byId[[int]$p.ParentProcessId]
    [pscustomobject]@{
      Id          = $id
      Name        = $p.Name
      Parent      = if ($parent) { $parent.Name } else { $null }
      HasChildren = [bool]($all | Where-Object { [int]$_.ParentProcessId -eq $id -and $_.Name -ne 'conhost.exe' } | Select-Object -First 1)
      Cwd         = $cwd
    }
  }
}
