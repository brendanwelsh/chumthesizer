// Chumthesizer Trackpad Bridge
// Reads the Magic Trackpad's multi-finger contacts via the Windows Raw Input API
// (the sanctioned way for an app to read a Precision Touchpad) and streams them to
// the synth over a localhost WebSocket — the same bridge pattern as the Ulanzi dial.
//
//   build/run:  dotnet run        (from this folder)   →  ws://127.0.0.1:48808
//   message:    {"type":"contacts","points":[{"id":0,"x":0.5,"y":0.4}, ...]}
//
// HID parsing adapted from emoacht/RawInput.Touchpad (MIT). Requires the Magic
// Trackpad to be a Precision Touchpad (the imbushuo / MagicTrackpad2ForWindows driver).

using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace TrackpadBridge;

internal static class Program
{
    const int Port = 48808;
    static readonly WsServer Server = new();
    static WndProcDelegate? _wndProc; // keep alive

    [STAThread]
    static int Main()
    {
        Console.WriteLine($"Chumthesizer Trackpad Bridge → ws://127.0.0.1:{Port}");
        Server.Start(Port);
        Server.OnMessage = HandleCommand; // app → helper commands (gesture lock toggle)

        _wndProc = WndProc;
        var wc = new WNDCLASS
        {
            lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_wndProc),
            lpszClassName = "ChumTrackpadBridge",
        };
        if (RegisterClassW(ref wc) == 0)
        {
            Console.WriteLine("RegisterClass failed: " + Marshal.GetLastWin32Error());
            return 1;
        }
        var hwnd = CreateWindowExW(0, wc.lpszClassName, "", 0, 0, 0, 0, 0, HWND_MESSAGE, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (hwnd == IntPtr.Zero)
        {
            Console.WriteLine("CreateWindow failed: " + Marshal.GetLastWin32Error());
            return 1;
        }

        var rid = new[] { new RAWINPUTDEVICE { usUsagePage = 0x0D, usUsage = 0x05, dwFlags = RIDEV_INPUTSINK, hwndTarget = hwnd } };
        if (!RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
            Console.WriteLine("RegisterRawInputDevices failed: " + Marshal.GetLastWin32Error() + " — is the trackpad a Precision Touchpad?");
        else
            Console.WriteLine("Listening for touchpad fingers… touch the trackpad.");

        // auto-lock the trackpad to the instrument: silence 3/4-finger gestures (slides +
        // taps: desktop switch, Search/Start, Task view, action center) while we run; restore on exit
        GestureControl.Set(true);
        AppDomain.CurrentDomain.ProcessExit += (_, _) => GestureControl.Set(false);
        Console.CancelKeyPress += (_, _) => GestureControl.Set(false);

        // Also stop the trackpad from driving the system cursor while fingers are down: the
        // Magic Trackpad has no separate mouse device, so a LL mouse hook swallows the
        // synthesized move/clicks for ~180ms after each finger frame (a real USB mouse still
        // works when you're not touching the pad). Installed on this thread — its message loop
        // below dispatches the hook callbacks. Self-expires + unhooks on exit (see the file).
        MouseSuppressor.Install();

        while (GetMessageW(out MSG msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }
        return 0;
    }

    static long _lastLog;
    static IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_INPUT)
        {
            try
            {
                var pts = TouchParser.Parse(lParam);
                if (pts != null)
                {
                    // mark the "fingers down" clock the mouse hook reads BEFORE anything else, so
                    // the cursor stays suppressed even if broadcasting were to hiccup
                    if (pts.Length > 0) Touch.Mark();
                    Server.Broadcast(ToJson(pts));
                    var now = Environment.TickCount64;
                    if (pts.Length > 0 && now - _lastLog > 500) { _lastLog = now; Console.WriteLine($"{pts.Length} finger(s)"); }
                }
            }
            catch { /* keep the loop alive */ }
            return IntPtr.Zero;
        }
        return DefWindowProcW(hWnd, msg, wParam, lParam);
    }

    static string ToJson(Contact[] pts)
    {
        var sb = new StringBuilder("{\"type\":\"contacts\",\"points\":[");
        for (int i = 0; i < pts.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append("{\"id\":").Append(pts[i].Id)
              .Append(",\"x\":").Append(pts[i].X.ToString("0.###"))
              .Append(",\"y\":").Append(pts[i].Y.ToString("0.###"));
            if (pts[i].Size is double s) sb.Append(",\"s\":").Append(s.ToString("0.###")); // only present when the device reports area
            sb.Append('}');
        }
        return sb.Append("]}").ToString();
    }

    // app → helper: { "cmd":"gestures", "lock": true|false }
    static void HandleCommand(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("cmd", out var c) && c.GetString() == "gestures")
            {
                bool lk = root.TryGetProperty("lock", out var l) && l.GetBoolean();
                GestureControl.Set(lk);
                Console.WriteLine(lk ? "gestures locked (off) from the app." : "gestures unlocked (on) from the app.");
            }
        }
        catch { /* ignore malformed */ }
    }

    // ── Win32 windowing / raw input ─────────────────────────────────────────────
    delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    static readonly IntPtr HWND_MESSAGE = new(-3);
    const uint WM_INPUT = 0x00FF;
    const uint RIDEV_INPUTSINK = 0x00000100;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASS
    {
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string? lpszMenuName;
        public string lpszClassName;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int ptx; public int pty; }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE { public ushort usUsagePage; public ushort usUsage; public uint dwFlags; public IntPtr hwndTarget; }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern ushort RegisterClassW(ref WNDCLASS lpWndClass);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateWindowExW(uint exStyle, string className, string windowName, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr DefWindowProcW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetMessageW(out MSG msg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")]
    static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr DispatchMessageW(ref MSG msg);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint num, uint size);
}

// Size is the optional normalized contact area (0..1) — only set when this PTP actually
// reports Tip-Pressure / Width / Height; null on hardware (like most Magic Trackpads) that
// exposes none, in which case it never reaches the JSON and the TS falls back to Y-position.
internal readonly record struct Contact(int Id, double X, double Y, double? Size = null);
