// MouseSuppressor — a low-level mouse hook (WH_MOUSE_LL) that swallows cursor movement
// and clicks ONLY in the brief window after the trackpad last had fingers on it.
//
// Why: the Apple Magic Trackpad has no separate mouse device — its system cursor comes
// from the very same multitouch device this helper reads. So while you're playing the
// synth, those finger moves also drag the OS cursor and fire taps/clicks. We can't
// disable a mouse device (there isn't one), so we instead intercept the synthesized
// mouse input at the LL hook and drop it — but ONLY while fingers are genuinely down.
//
// SAFETY IS PARAMOUNT — this hook sees EVERY mouse event system-wide, so a stuck "swallow"
// would brick the user's pointer (a real USB mouse included). The rules:
//   • Default to PASS-THROUGH. We swallow ONLY when (now - lastTouch) < WindowMs, and
//     lastTouch is bumped exclusively by frames that actually carry >=1 contact (see
//     Touch.Mark()). No contacts → the window lapses in WindowMs and the mouse is normal.
//   • The window is short (180 ms) and self-expiring — even if the helper hangs, the
//     pointer comes back on its own a fraction of a second after the last finger frame.
//   • We never touch the keyboard (mouse hook only) and never swallow anything but the
//     specific cursor/click/wheel messages below — unknown messages always pass through.
//   • The hook is unhooked on ProcessExit and Ctrl+C so it can't outlive the helper.
// A separate USB mouse keeps working whenever you're not touching the pad.

using System.Runtime.InteropServices;

namespace TrackpadBridge;

/// <summary>Shared "fingers are down" clock. The WM_INPUT handler calls Mark() on every
/// frame that has at least one real contact; the hook reads SinceTouchMs() to decide.</summary>
internal static class Touch
{
    static long _last = long.MinValue / 2; // far in the past → "not touched" at startup

    /// <summary>Call once per input frame that carries >=1 active contact.</summary>
    public static void Mark() => Volatile.Write(ref _last, Environment.TickCount64);

    /// <summary>Milliseconds since the last finger frame (huge at startup / when idle).</summary>
    public static long SinceTouchMs() => Environment.TickCount64 - Volatile.Read(ref _last);
}

internal static class MouseSuppressor
{
    // How long after the last finger frame we keep swallowing mouse input. Short on purpose:
    // long enough to cover the gap between PTP frames (~8 ms) and a lift, short enough that the
    // pointer is never locked for a perceptible time once you take your fingers off.
    const long WindowMs = 180;

    static IntPtr _hook = IntPtr.Zero;
    static LowLevelMouseProc? _proc;            // keep the delegate alive (GC would unhook us)
    static volatile bool _enabled = true;

    /// <summary>Install the hook. Call once at startup; it self-expires per the touch clock.</summary>
    public static void Install()
    {
        if (_hook != IntPtr.Zero) return;
        try
        {
            _proc = HookProc;
            IntPtr hMod = GetModuleHandleW(null); // WH_MOUSE_LL ignores the module; null is fine
            _hook = SetWindowsHookExW(WH_MOUSE_LL, _proc, hMod, 0);
            if (_hook == IntPtr.Zero)
                Console.WriteLine("mouse suppressor: SetWindowsHookEx failed (" + Marshal.GetLastWin32Error() + ") — cursor will move while you play.");
            else
                Console.WriteLine("Mouse suppressor armed — the trackpad won't drive the system cursor while fingers are down.");

            // Belt + suspenders: make sure the hook can never outlive the process — free the
            // pointer on normal exit, Ctrl+C, AND an unhandled crash. (Windows also auto-removes
            // a process's LL hooks when it dies, so the mouse is never left bricked regardless.)
            AppDomain.CurrentDomain.ProcessExit += (_, _) => Uninstall();
            Console.CancelKeyPress += (_, _) => Uninstall();
            AppDomain.CurrentDomain.UnhandledException += (_, _) => Uninstall();
        }
        catch (Exception e) { Console.WriteLine("mouse suppressor skipped: " + e.Message); }
    }

    /// <summary>Remove the hook (idempotent). Called on exit so the pointer is always freed.</summary>
    public static void Uninstall()
    {
        var h = _hook;
        _hook = IntPtr.Zero;
        if (h != IntPtr.Zero) { try { UnhookWindowsHookEx(h); } catch { /* exiting anyway */ } }
    }

    /// <summary>Optional kill-switch (e.g. from an app command). Default ON.</summary>
    public static void SetEnabled(bool on) => _enabled = on;

    static IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        // nCode < 0 → MUST pass straight through per the Win32 contract.
        if (nCode < 0 || !_enabled) return CallNextHookEx(_hook, nCode, wParam, lParam);

        // Only consider swallowing while a finger was very recently on the pad. Any doubt
        // (window lapsed, unexpected state) → fall through to CallNextHookEx = pass.
        if (Touch.SinceTouchMs() < WindowMs && IsCursorMessage((int)wParam))
            return (IntPtr)1; // eat it: the trackpad's own move/click never reaches the OS cursor

        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }

    // The exact set we suppress: pointer motion, every button down/up, and the wheels.
    // Anything not in this list passes through untouched (default-safe).
    static bool IsCursorMessage(int msg) => msg switch
    {
        WM_MOUSEMOVE
        or WM_LBUTTONDOWN or WM_LBUTTONUP
        or WM_RBUTTONDOWN or WM_RBUTTONUP
        or WM_MBUTTONDOWN or WM_MBUTTONUP
        or WM_XBUTTONDOWN or WM_XBUTTONUP
        or WM_MOUSEWHEEL or WM_MOUSEHWHEEL => true,
        _ => false,
    };

    // ── Win32 ───────────────────────────────────────────────────────────────────
    const int WH_MOUSE_LL = 14;
    const int WM_MOUSEMOVE = 0x0200;
    const int WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202;
    const int WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205;
    const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
    const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
    const int WM_MOUSEWHEEL = 0x020A, WM_MOUSEHWHEEL = 0x020E;

    delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr SetWindowsHookExW(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr GetModuleHandleW(string? lpModuleName);
}
