# Streams visible top-level window rectangles as JSON lines, top of the z-order first.
# A line is printed only when the list changed. ASCII only on purpose (console codepage safety).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File windows-watch.ps1 -Parent <pid>
param([int]$Parent = 0)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class CompanionWin {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

  static readonly string[] SkipClasses = {
    "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow"
  };

  public static string Snapshot() {
    // Our own window must not become a platform for itself.
    HashSet<uint> self = new HashSet<uint>();
    foreach (Process p in Process.GetProcessesByName("companion-window")) self.Add((uint)p.Id);

    List<string> rows = new List<string>();
    EnumWindows(delegate (IntPtr h, IntPtr _) {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true; // tool window without app-window flag
      if ((ex & 0x08000000) != 0) return true; // no-activate (overlays, tooltips)
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (self.Contains(pid)) return true;
      if (GetWindowTextLength(h) == 0) return true;
      StringBuilder cls = new StringBuilder(128);
      GetClassName(h, cls, 128);
      string name = cls.ToString();
      foreach (string skip in SkipClasses) if (name == skip) return true;
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true; // extended frame bounds (no shadow)
      int w = r.R - r.L, hh = r.B - r.T;
      if (w < 200 || hh < 100) return true;
      rows.Add("[" + h.ToInt64() + "," + r.L + "," + r.T + "," + r.R + "," + r.B + "," + (IsZoomed(h) ? 1 : 0) + "]");
      return true;
    }, IntPtr.Zero);
    return "{\"w\":[" + string.Join(",", rows.ToArray()) + "]}";
  }
}
'@

[CompanionWin]::SetProcessDPIAware() | Out-Null
$last = ''
$tick = 0
while ($true) {
  $snap = [CompanionWin]::Snapshot()
  if ($snap -ne $last) {
    [Console]::Out.WriteLine($snap)
    [Console]::Out.Flush()
    $last = $snap
  }
  Start-Sleep -Milliseconds 150
  $tick += 1
  # Exit when the parent server is gone (checked every ~3s) so no orphan keeps running.
  if ($Parent -gt 0 -and ($tick % 20) -eq 0) {
    if (-not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break }
  }
}
