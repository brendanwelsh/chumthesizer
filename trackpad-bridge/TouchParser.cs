// Parses a WM_INPUT precision-touchpad report into normalized finger contacts.
// Adapted from emoacht/RawInput.Touchpad (MIT), with per-contact Tip-Switch checking
// and 0..1 normalization added so we only emit fingers that are actually down.

using System.Runtime.InteropServices;

namespace TrackpadBridge;

internal static class TouchParser
{
    // ── Contact-area capability probe ────────────────────────────────────────────
    // Windows Precision-Touchpads describe per-contact geometry with optional HID
    // digitizer usages (page 0x0D): Tip Pressure 0x30, Width 0x48, Height 0x49. Most
    // PTPs (and the Apple Magic Trackpad under the imbushuo PTP driver) expose only X/Y/
    // ContactId/TipSwitch, so these are OFTEN ABSENT — we never fake them. We detect what
    // the device actually reports from its value caps (once) and log the ranges so it's
    // clear on real hardware what's available. If none are present, we emit no "s" field.
    static bool _probed;
    static bool _hasPressure, _hasWidth, _hasHeight;
    static int _presMin, _presMax = 1, _widMin, _widMax = 1, _hgtMin, _hgtMax = 1;

    public static Contact[]? Parse(IntPtr lParam)
    {
        uint size = 0;
        uint headerSize = (uint)Marshal.SizeOf<RAWINPUTHEADER>();
        if (GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, headerSize) != 0) return null;

        IntPtr raw = Marshal.AllocHGlobal((int)size);
        byte[] hidReport;
        IntPtr hDevice;
        try
        {
            if (GetRawInputData(lParam, RID_INPUT, raw, ref size, headerSize) != size) return null;
            var header = Marshal.PtrToStructure<RAWINPUTHEADER>(raw);
            if (header.dwType != RIM_TYPEHID) return null;
            hDevice = header.hDevice;

            int hidOffset = (int)headerSize;                 // RAWHID follows the header
            uint dwSizeHid = (uint)Marshal.ReadInt32(raw, hidOffset);
            uint dwCount = (uint)Marshal.ReadInt32(raw, hidOffset + 4);
            int reportLen = (int)(dwSizeHid * dwCount);
            if (reportLen <= 0) return Array.Empty<Contact>();
            hidReport = new byte[reportLen];
            Marshal.Copy(raw + hidOffset + 8, hidReport, 0, reportLen);
        }
        finally { Marshal.FreeHGlobal(raw); }

        IntPtr preparsed = IntPtr.Zero;
        IntPtr reportPtr = Marshal.AllocHGlobal(hidReport.Length);
        Marshal.Copy(hidReport, 0, reportPtr, hidReport.Length);
        try
        {
            uint ppSize = 0;
            if (GetRawInputDeviceInfoW(hDevice, RIDI_PREPARSEDDATA, IntPtr.Zero, ref ppSize) != 0) return null;
            preparsed = Marshal.AllocHGlobal((int)ppSize);
            if (GetRawInputDeviceInfoW(hDevice, RIDI_PREPARSEDDATA, preparsed, ref ppSize) != ppSize) return null;
            if (HidP_GetCaps(preparsed, out HIDP_CAPS caps) != HIDP_STATUS_SUCCESS) return null;

            ushort vcLen = caps.NumberInputValueCaps;
            if (vcLen == 0) return Array.Empty<Contact>();
            var vcaps = new HIDP_VALUE_CAPS[vcLen];
            if (HidP_GetValueCaps(0, vcaps, ref vcLen, preparsed) != HIDP_STATUS_SUCCESS) return null;

            ProbeAreaCaps(vcaps); // one-time: discover + log whether this PTP reports area at all

            var byCol = new Dictionary<ushort, Accum>();
            int xMin = 0, xMax = 1, yMin = 0, yMax = 1;

            foreach (var vc in vcaps)
            {
                ushort usage = vc.UsageMin;
                if (HidP_GetUsageValue(0, vc.UsagePage, vc.LinkCollection, usage, out uint val, preparsed, reportPtr, (uint)hidReport.Length) != HIDP_STATUS_SUCCESS)
                    continue;
                if (vc.LinkCollection == 0) continue; // collection 0 = device-level (scan time / contact count)

                byCol.TryGetValue(vc.LinkCollection, out var c);
                if (vc.UsagePage == 0x01 && usage == 0x30) { c.x = (int)val; c.hasX = true; xMin = vc.LogicalMin; xMax = vc.LogicalMax; }
                else if (vc.UsagePage == 0x01 && usage == 0x31) { c.y = (int)val; c.hasY = true; yMin = vc.LogicalMin; yMax = vc.LogicalMax; }
                else if (vc.UsagePage == 0x0D && usage == 0x51) { c.id = (int)val; c.hasId = true; }
                // optional per-contact geometry → dynamics; only set if this device exposes it
                else if (vc.UsagePage == 0x0D && usage == 0x30) { c.pres = (int)val; c.hasPres = true; }
                else if (vc.UsagePage == 0x0D && usage == 0x48) { c.wid = (int)val; c.hasWid = true; }
                else if (vc.UsagePage == 0x0D && usage == 0x49) { c.hgt = (int)val; c.hasHgt = true; }
                byCol[vc.LinkCollection] = c;
            }

            int xr = Math.Max(1, xMax - xMin), yr = Math.Max(1, yMax - yMin);
            bool anyArea = _hasPressure || _hasWidth || _hasHeight;
            var list = new List<Contact>();
            foreach (var kv in byCol)
            {
                var c = kv.Value;
                if (!c.hasX || !c.hasY) continue;
                if (!IsTipDown(kv.Key, preparsed, reportPtr, hidReport.Length, caps.NumberInputButtonCaps)) continue;
                double nx = Clamp01((c.x - xMin) / (double)xr);
                double ny = Clamp01((c.y - yMin) / (double)yr);
                double? area = anyArea ? SizeOf(c) : null;
                list.Add(new Contact(c.hasId ? c.id : kv.Key, nx, ny, area));
            }
            return list.ToArray();
        }
        finally
        {
            if (preparsed != IntPtr.Zero) Marshal.FreeHGlobal(preparsed);
            Marshal.FreeHGlobal(reportPtr);
        }
    }

    // per-contact accumulator while we sift the value caps for one report
    struct Accum
    {
        public int x, y, id, pres, wid, hgt;
        public bool hasX, hasY, hasId, hasPres, hasWid, hasHgt;
    }

    // One-time: scan the device's value caps for the optional area usages and remember
    // their logical ranges. Logs exactly what this hardware exposes so it's unambiguous
    // on a real trackpad whether dynamics-from-area is even possible.
    static void ProbeAreaCaps(HIDP_VALUE_CAPS[] vcaps)
    {
        if (_probed) return;
        _probed = true;
        foreach (var vc in vcaps)
        {
            if (vc.UsagePage != 0x0D) continue;
            ushort u = vc.UsageMin;
            if (u == 0x30) { _hasPressure = true; _presMin = vc.LogicalMin; _presMax = vc.LogicalMax; }
            else if (u == 0x48) { _hasWidth = true; _widMin = vc.LogicalMin; _widMax = vc.LogicalMax; }
            else if (u == 0x49) { _hasHeight = true; _hgtMin = vc.LogicalMin; _hgtMax = vc.LogicalMax; }
        }
        if (_hasPressure || _hasWidth || _hasHeight)
        {
            var bits = new List<string>();
            if (_hasPressure) bits.Add($"TipPressure[{_presMin}..{_presMax}]");
            if (_hasWidth) bits.Add($"Width[{_widMin}..{_widMax}]");
            if (_hasHeight) bits.Add($"Height[{_hgtMin}..{_hgtMax}]");
            Console.WriteLine("Contact area available → " + string.Join(", ", bits) + " — sending 's' (dynamics from finger size/pressure).");
        }
        else
        {
            Console.WriteLine("Contact area NOT available on this trackpad (no Tip-Pressure/Width/Height usages) — staying on Y-position dynamics.");
        }
    }

    // Normalize whatever area usage(s) this device offers into a single 0..1 "size".
    // Prefer Tip Pressure; otherwise use the contact ellipse (geometric mean of W·H, or
    // whichever single axis exists). Never invoked unless at least one usage is present.
    static double? SizeOf(Accum c)
    {
        if (_hasPressure && c.hasPres)
            return Norm(c.pres, _presMin, _presMax);

        double? nw = (_hasWidth && c.hasWid) ? Norm(c.wid, _widMin, _widMax) : (double?)null;
        double? nh = (_hasHeight && c.hasHgt) ? Norm(c.hgt, _hgtMin, _hgtMax) : (double?)null;
        if (nw.HasValue && nh.HasValue) return Clamp01(Math.Sqrt(nw.Value * nh.Value));
        return nw ?? nh; // single axis present this frame
    }

    static double Norm(int v, int min, int max)
    {
        int r = Math.Max(1, max - min);
        return Clamp01((v - min) / (double)r);
    }

    static bool IsTipDown(ushort col, IntPtr preparsed, IntPtr report, int reportLen, ushort maxButtons)
    {
        uint count = (uint)Math.Max(8, (int)maxButtons);
        var usages = new ushort[count];
        if (HidP_GetUsages(0, 0x0D, col, usages, ref count, preparsed, report, (uint)reportLen) != HIDP_STATUS_SUCCESS)
            return false;
        for (int i = 0; i < count; i++) if (usages[i] == 0x42) return true; // Tip Switch
        return false;
    }

    static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

    const uint RID_INPUT = 0x10000003;
    const uint RIDI_PREPARSEDDATA = 0x20000005;
    const uint RIM_TYPEHID = 2;
    const uint HIDP_STATUS_SUCCESS = 0x00110000;

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTHEADER { public uint dwType; public uint dwSize; public IntPtr hDevice; public IntPtr wParam; }

    [StructLayout(LayoutKind.Sequential)]
    struct HIDP_CAPS
    {
        public ushort Usage; public ushort UsagePage;
        public ushort InputReportByteLength; public ushort OutputReportByteLength; public ushort FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes;
        public ushort NumberInputButtonCaps; public ushort NumberInputValueCaps; public ushort NumberInputDataIndices;
        public ushort NumberOutputButtonCaps; public ushort NumberOutputValueCaps; public ushort NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps; public ushort NumberFeatureValueCaps; public ushort NumberFeatureDataIndices;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct HIDP_VALUE_CAPS
    {
        public ushort UsagePage; public byte ReportID;
        [MarshalAs(UnmanagedType.U1)] public bool IsAlias;
        public ushort BitField; public ushort LinkCollection; public ushort LinkUsage; public ushort LinkUsagePage;
        [MarshalAs(UnmanagedType.U1)] public bool IsRange;
        [MarshalAs(UnmanagedType.U1)] public bool IsStringRange;
        [MarshalAs(UnmanagedType.U1)] public bool IsDesignatorRange;
        [MarshalAs(UnmanagedType.U1)] public bool IsAbsolute;
        [MarshalAs(UnmanagedType.U1)] public bool HasNull;
        public byte Reserved;
        public ushort BitSize; public ushort ReportCount;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 5)] public ushort[] Reserved2;
        public uint UnitsExp; public uint Units;
        public int LogicalMin; public int LogicalMax; public int PhysicalMin; public int PhysicalMax;
        public ushort UsageMin; public ushort UsageMax;
        public ushort StringMin; public ushort StringMax;
        public ushort DesignatorMin; public ushort DesignatorMax;
        public ushort DataIndexMin; public ushort DataIndexMax;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputData(IntPtr hRawInput, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputDeviceInfoW(IntPtr hDevice, uint command, IntPtr data, ref uint size);
    [DllImport("hid.dll")]
    static extern uint HidP_GetCaps(IntPtr preparsed, out HIDP_CAPS caps);
    [DllImport("hid.dll")]
    static extern uint HidP_GetValueCaps(int reportType, [Out] HIDP_VALUE_CAPS[] valueCaps, ref ushort len, IntPtr preparsed);
    [DllImport("hid.dll")]
    static extern uint HidP_GetUsageValue(int reportType, ushort usagePage, ushort linkCollection, ushort usage, out uint value, IntPtr preparsed, IntPtr report, uint reportLen);
    [DllImport("hid.dll")]
    static extern uint HidP_GetUsages(int reportType, ushort usagePage, ushort linkCollection, [In, Out] ushort[] usageList, ref uint usageLength, IntPtr preparsed, IntPtr report, uint reportLen);
}
