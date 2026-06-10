// Automatically silences the Windows 3/4-finger touchpad gestures (slides AND taps)
// that hijack your fingers — switching desktops/apps, opening Search/Start, Task view,
// the action center — while the bridge runs, and restores them when it exits.
//
// The shell only re-reads these when Explorer restarts, so we nudge it — but only when
// something actually changed, so it's a no-op (no blink) if they're already off.

using Microsoft.Win32;
using System.Diagnostics;

namespace TrackpadBridge;

internal static class GestureControl
{
    const string Path = @"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad";
    static readonly string[] Names =
    {
        "ThreeFingerSlideEnabled", "FourFingerSlideEnabled",
        "ThreeFingerTapEnabled", "FourFingerTapEnabled",
    };
    static readonly Dictionary<string, int?> Saved = new();
    static bool _changed;
    static bool _locked;

    /// <summary>High-level toggle used by both the auto-lock and the in-app button.</summary>
    public static void Set(bool lockIt)
    {
        if (lockIt == _locked) return;
        _locked = lockIt;
        if (lockIt) Disable(); else Restore();
    }

    public static void Disable()
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Path, writable: true);
            if (k is null) return;

            Saved.Clear();
            bool any = false;
            foreach (var name in Names)
            {
                var v = k.GetValue(name) as int?;
                Saved[name] = v;            // null = value missing (Windows default = the gesture is ON)
                if ((v ?? 1) != 0) any = true;
                k.SetValue(name, 0, RegistryValueKind.DWord);
            }

            if (any)
            {
                _changed = true;
                Console.WriteLine("Silencing 3/4-finger touchpad gestures while you play (taskbar blinks once)…");
                RefreshShell();
            }
            else
            {
                Console.WriteLine("3/4-finger gestures already off — your fingers stay in the app.");
            }
        }
        catch (Exception e) { Console.WriteLine("gesture lock skipped: " + e.Message); }
    }

    public static void Restore()
    {
        if (!_changed) return;
        _changed = false;
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Path, writable: true);
            if (k is null) return;
            foreach (var name in Names)
            {
                if (!Saved.TryGetValue(name, out var v)) continue;
                if (v is int iv) k.SetValue(name, iv, RegistryValueKind.DWord);
                else { try { k.DeleteValue(name, throwOnMissingValue: false); } catch { } } // was default → revert
            }
            Console.WriteLine("Restoring your touchpad gestures…");
            RefreshShell();
        }
        catch { /* best effort */ }
    }

    static void RefreshShell()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("explorer"))
            {
                try { p.Kill(); } catch { }
            }
            Thread.Sleep(600);
            if (Process.GetProcessesByName("explorer").Length == 0)
                Process.Start(new ProcessStartInfo("explorer.exe") { UseShellExecute = true });
        }
        catch { }
    }
}
