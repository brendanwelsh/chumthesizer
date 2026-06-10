// A minimal localhost WebSocket server (server→client text frames only) — enough to
// stream finger contacts to the synth. Uses a raw TcpListener so there's no HttpListener
// URL-ACL / admin requirement.

using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace TrackpadBridge;

internal sealed class WsServer
{
    readonly List<NetworkStream> _clients = new();
    readonly object _gate = new();
    TcpListener? _listener;
    public Action<string>? OnMessage;   // app → helper commands (e.g. gesture lock)

    public void Start(int port)
    {
        _listener = new TcpListener(IPAddress.Loopback, port);
        _listener.Start();
        _ = Task.Run(AcceptLoop);
    }

    async Task AcceptLoop()
    {
        while (true)
        {
            try
            {
                var client = await _listener!.AcceptTcpClientAsync();
                _ = Task.Run(() => Handshake(client));
            }
            catch { await Task.Delay(200); }
        }
    }

    void Handshake(TcpClient client)
    {
        try
        {
            var stream = client.GetStream();
            var buf = new byte[2048];
            int n = stream.Read(buf, 0, buf.Length);
            var req = Encoding.UTF8.GetString(buf, 0, n);
            var m = Regex.Match(req, "Sec-WebSocket-Key:\\s*(.+)");
            if (!m.Success) { client.Close(); return; }
            var key = m.Groups[1].Value.Trim();
            var accept = Convert.ToBase64String(SHA1.HashData(Encoding.UTF8.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            var resp = "HTTP/1.1 101 Switching Protocols\r\n" +
                       "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
                       "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            var rb = Encoding.UTF8.GetBytes(resp);
            stream.Write(rb, 0, rb.Length);
            lock (_gate) _clients.Add(stream);
            Console.WriteLine("synth connected");
            ReadLoop(stream);
        }
        catch { try { client.Close(); } catch { } }
    }

    // read client → server frames (masked) so the app can send us commands
    void ReadLoop(NetworkStream stream)
    {
        try
        {
            var hdr = new byte[2];
            while (true)
            {
                ReadExact(stream, hdr, 2);
                int opcode = hdr[0] & 0x0F;
                bool masked = (hdr[1] & 0x80) != 0;
                long len = hdr[1] & 0x7F;
                if (len == 126) { var ext = new byte[2]; ReadExact(stream, ext, 2); len = (ext[0] << 8) | ext[1]; }
                else if (len == 127) { var ext = new byte[8]; ReadExact(stream, ext, 8); len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | ext[i]; }
                var mask = new byte[4];
                if (masked) ReadExact(stream, mask, 4);
                var payload = new byte[len];
                if (len > 0) ReadExact(stream, payload, (int)len);
                if (masked) for (int i = 0; i < payload.Length; i++) payload[i] ^= mask[i % 4];
                if (opcode == 0x8) break;                                    // close
                if (opcode == 0x1) OnMessage?.Invoke(Encoding.UTF8.GetString(payload)); // text
            }
        }
        catch { /* client gone */ }
        finally { lock (_gate) _clients.Remove(stream); }
    }

    static void ReadExact(NetworkStream s, byte[] buf, int n)
    {
        int off = 0;
        while (off < n) { int r = s.Read(buf, off, n - off); if (r <= 0) throw new IOException("closed"); off += r; }
    }

    public void Broadcast(string json)
    {
        var frame = Frame(Encoding.UTF8.GetBytes(json));
        lock (_gate)
        {
            for (int i = _clients.Count - 1; i >= 0; i--)
            {
                try { _clients[i].Write(frame, 0, frame.Length); }
                catch { try { _clients[i].Dispose(); } catch { } _clients.RemoveAt(i); }
            }
        }
    }

    static byte[] Frame(byte[] payload)
    {
        int len = payload.Length;
        byte[] header = len < 126
            ? new byte[] { 0x81, (byte)len }
            : len <= 0xFFFF
                ? new byte[] { 0x81, 126, (byte)(len >> 8), (byte)len }
                : new byte[] { 0x81, 127, 0, 0, 0, 0, (byte)(len >> 24), (byte)(len >> 16), (byte)(len >> 8), (byte)len };
        var frame = new byte[header.Length + len];
        Buffer.BlockCopy(header, 0, frame, 0, header.Length);
        Buffer.BlockCopy(payload, 0, frame, header.Length, len);
        return frame;
    }
}
