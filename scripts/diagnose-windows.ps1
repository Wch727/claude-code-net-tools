$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows only' }
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class NetToolWindows {
  public delegate bool Callback(IntPtr hwnd, IntPtr param);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr param);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  public class Item { public long Handle; public uint Pid; public string Title, ClassName; public int Left, Top, Width, Height; }
  public static Item[] Read() {
    var items = new List<Item>();
    EnumWindows((hwnd, ignored) => {
      Rect rect; uint pid;
      if (!IsWindowVisible(hwnd) || !GetWindowRect(hwnd, out rect)) return true;
      if (rect.Right-rect.Left < 100 || rect.Bottom-rect.Top < 100) return true;
      var title = new StringBuilder(512); var name = new StringBuilder(128);
      GetWindowText(hwnd,title,512); GetClassName(hwnd,name,128); GetWindowThreadProcessId(hwnd,out pid);
      items.Add(new Item { Handle=hwnd.ToInt64(), Pid=pid, Title=title.ToString(), ClassName=name.ToString(), Left=rect.Left, Top=rect.Top, Width=rect.Right-rect.Left, Height=rect.Bottom-rect.Top });
      return true;
    },IntPtr.Zero);
    return items.ToArray();
  }
}
'@
[NetToolWindows]::Read() | ForEach-Object {
  $process = Get-Process -Id $_.Pid -ErrorAction SilentlyContinue
  [pscustomobject]@{ Pid=$_.Pid; Process=$process.ProcessName; Handle=$_.Handle; Class=$_.ClassName; Title=$_.Title; Left=$_.Left; Top=$_.Top; Width=$_.Width; Height=$_.Height }
} | ConvertTo-Json -Depth 3
