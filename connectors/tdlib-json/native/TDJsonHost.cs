// Native host using the official TDLib JSON ABI. NO Telegram protocol code.
// Copyright (c) YANCE V2 contributors, project glue only.
// Worker mode may ONLY be spawned by trusted W54/W47 application after the
// actual user opts into Telegram authentication. Probe mode is offline only.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class TD
{
    [DllImport("tdjson.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "td_create_client_id")]
    public static extern int CreateClientId();
    [DllImport("tdjson.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "td_send")]
    public static extern void Send(int clientId, IntPtr request);
    [DllImport("tdjson.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "td_receive")]
    public static extern IntPtr Receive(double timeout);
    [DllImport("tdjson.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "td_execute")]
    public static extern IntPtr Execute(IntPtr request);

    public static string Decode(IntPtr p)
    {
        if (p == IntPtr.Zero) return null;
        int len = 0;
        while (Marshal.ReadByte(p, len) != 0) {
            if (++len > 16 * 1024 * 1024) throw new InvalidDataException("NATIVE_RESULT_TOO_LARGE");
        }
        byte[] bytes = new byte[len];
        Marshal.Copy(p, bytes, 0, len);
        return Encoding.UTF8.GetString(bytes);
    }

    private static IntPtr EncodeUtf8(string text)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        IntPtr pointer = Marshal.AllocHGlobal(bytes.Length + 1);
        Marshal.Copy(bytes, 0, pointer, bytes.Length);
        Marshal.WriteByte(pointer, bytes.Length, 0);
        return pointer;
    }

    public static string ExecuteJson(string query)
    {
        IntPtr p = EncodeUtf8(query);
        try { return Decode(Execute(p)); } finally { Marshal.FreeHGlobal(p); }
    }

    public static void SendJson(int clientId, string query)
    {
        IntPtr p = EncodeUtf8(query);
        try { Send(clientId, p); } finally { Marshal.FreeHGlobal(p); }
    }
}

internal sealed class Host
{
    // Only official auth/read-only TDLib functions. A real send may ONLY be
    // introduced through W25's sole MessageDelivery signed contract.
    private static readonly HashSet<string> Allowed = new HashSet<string>(StringComparer.Ordinal)
    {
        "getOption", "setTdlibParameters", "checkDatabaseEncryptionKey",
        "setAuthenticationPhoneNumber", "setAuthenticationEmailAddress",
        "checkAuthenticationEmailCode", "checkAuthenticationCode",
        "checkAuthenticationPassword", "requestQrCodeAuthentication",
        "registerUser", "logOut", "close", "getMe", "getChats",
        "loadChats", "getChat", "getChatHistory", "getUser",
        "getContacts", "getUserFullInfo", "getMessage",
        "getUserProfilePhotos", "getFile", "downloadFile"
    };
    private static readonly object StdoutLock = new object();
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        { MaxJsonLength = 16 * 1024 * 1024, RecursionLimit = 60 };
    private static volatile bool alive = true;
    private static volatile bool ready = false;
    private static int clientId = 0;

    private static void Emit(object payload)
    {
        lock (StdoutLock) {
            Console.Out.WriteLine(Json.Serialize(payload));
            Console.Out.Flush();
        }
    }

    private static Dictionary<string,object> Parse(string line)
    {
        if (line == null || line.Length > 1024 * 1024) throw new InvalidDataException("REQUEST_TOO_LARGE");
        Dictionary<string,object> obj = Json.Deserialize<Dictionary<string,object>>(line);
        if (obj == null) throw new InvalidDataException("NOT_OBJECT");
        return obj;
    }

    private static string TypeOf(Dictionary<string,object> query)
    {
        object v;
        return query.TryGetValue("@type", out v) ? v as string : null;
    }

    private static void ReceiveCommands()
    {
        try {
            string line;
            while (alive && (line = Console.In.ReadLine()) != null) {
                try {
                    var command = Parse(line);
                    object opRaw;
                    string op = command.TryGetValue("action", out opRaw) ? opRaw as string : null;
                    if (op == "stop") {
                        // Local shutdown does not represent Telegram logout; no account
                        // authorization is created by merely starting a worker.
                        alive = false;
                        break;
                    }
                    if (op != "tdlib") { Emit(new {kind="error",code="OPERATION_DENIED"}); continue; }
                    object rawQuery;
                    if (!command.TryGetValue("query", out rawQuery)) {
                        Emit(new {kind="error",code="MISSING_NATIVE_REQUEST"}); continue;
                    }
                    var query = rawQuery as Dictionary<string,object>;
                    if (query == null) { Emit(new {kind="error",code="INVALID_NATIVE_REQUEST"}); continue; }
                    string nativeType = TypeOf(query);
                    if (nativeType == null || !Allowed.Contains(nativeType)) {
                        Emit(new {kind="error",code="NATIVE_METHOD_NOT_ALLOWED"}); continue;
                    }
                    if (nativeType == "getMe" || nativeType == "getChats" ||
                        nativeType == "loadChats" || nativeType == "getChat" ||
                        nativeType == "getChatHistory" || nativeType == "getUser" ||
                        nativeType == "getContacts" || nativeType == "getUserFullInfo" ||
                        nativeType == "getMessage" || nativeType == "getUserProfilePhotos" ||
                        nativeType == "getFile" || nativeType == "downloadFile")
                    {
                        if (!ready) { Emit(new {kind="error",code="WAITING_USER_AUTH"}); continue; }
                    }
                    // Only caller-supplied configuration reaches the real official TDLib.
                    // Never print auth queries, phone, OTP, password, api_hash or raw query.
                    TD.SendJson(clientId, Json.Serialize(query));
                    Emit(new { kind="native_request_accepted", method=nativeType, sent=false,
                      meaning="td_send_enqueued_not_provider_ack" });
                } catch (Exception ex) {
                    Emit(new {kind="error",code=ex is InvalidDataException ? ex.Message : "NATIVE_REQUEST_REJECTED"});
                }
            }
        } catch { alive = false; }
    }

    private static int Probe()
    {
        // This is a real TDLib exported C ABI call with no network, no account
        // session, no phone/code, no client or database.
        string body = TD.ExecuteJson("{\"@type\":\"getTextEntities\",\"text\":\"offline native probe\"}");
        var result = body == null ? null : Parse(body);
        if (result == null || TypeOf(result) != "textEntities")
            throw new InvalidDataException("TDJSON_PROBE_BAD_RESPONSE");
        Emit(new {kind="native_tdjson_probe", loaded=true, officialAbi="td_execute",
          resultType="textEntities", accountConnected=false,
          loginStarted=false, canSend=false});
        return 0;
    }

    private static int ProbeUnauthorizedState()
    {
        // Brand-new client; NO parameters, database path, API credentials,
        // account login, restore, phone, OTP, or network request to Telegram.
        TD.ExecuteJson("{\"@type\":\"setLogVerbosityLevel\",\"new_verbosity_level\":0}");
        int id = TD.CreateClientId();
        if (id < 1) throw new InvalidDataException("INVALID_TDLIB_CLIENT_ID");
        TD.SendJson(id, "{\"@type\":\"getOption\",\"name\":\"version\"}");
        for (int i = 0; i < 35; i++) {
            string received = TD.Decode(TD.Receive(0.2));
            if (received == null) continue;
            var evt = Parse(received);
            if (TypeOf(evt) != "updateAuthorizationState") continue;
            object stateRaw;
            if (!evt.TryGetValue("authorization_state", out stateRaw)) break;
            var state = stateRaw as Dictionary<string,object>;
            string name = state == null ? null : TypeOf(state);
            Emit(new {kind="native_tdjson_auth_probe",loaded=true,
              state=name,authorized=false,credentialsSupplied=false,
              accountConnected=false,canSend=false,
              client_id=id});
            return name == "authorizationStateWaitTdlibParameters" ? 0 : 36;
        }
        Emit(new {kind="error",code="TDLIB_AUTH_STATE_NOT_OBSERVED",
          credentialsSupplied=false,accountConnected=false});
        return 35;
    }

    private static int Worker()
    {
        TD.ExecuteJson("{\"@type\":\"setLogVerbosityLevel\",\"new_verbosity_level\":0}");
        clientId = TD.CreateClientId();
        if (clientId < 1) throw new InvalidDataException("INVALID_TDLIB_CLIENT_ID");
        Emit(new {kind="native_tdjson_worker_started",client_id=clientId,
          source="OFFICIAL_TDLIB_JSON", authorized=false, canSend=false});
        Thread pump = new Thread(ReceiveCommands);
        pump.IsBackground = true;
        pump.Start();
        // TDLib requires only ONE consumer of td_receive per process.
        // Updates are emitted to trusted parent IPC only; not written to logs.
        while (alive) {
            string native = TD.Decode(TD.Receive(0.25));
            if (native == null) continue;
            Dictionary<string,object> evt = Parse(native);
            string type = TypeOf(evt);
            if (type == "updateAuthorizationState") {
                object stateRaw;
                if (evt.TryGetValue("authorization_state", out stateRaw)) {
                    var state = stateRaw as Dictionary<string,object>;
                    string name = state == null ? null : TypeOf(state);
                    ready = name == "authorizationStateReady";
                    // The original official AuthorizationState payload is carried
                    // only over parent-owned private stdin/stdout IPC. In particular
                    // authorizationStateWaitOtherDeviceConfirmation.link is the
                    // *real TDLib-generated* QR login link, never a fake image.
                    // No event content is written to diagnostic logs or public HTTP.
                    Emit(new {kind="tdlib_auth_state", state=name,
                      details=state, authorized=ready, canSend=false});
                    if (name == "authorizationStateClosed") { alive = false; }
                }
                continue;
            }
            // Parent must enforce current full W24 K/Consent before private
            // inbound data is used. Raw payload must remain in local IPC only.
            Emit(new {kind="tdlib_update", client_id=clientId, data=evt,
              trustedBindingVerified=false, canSend=false});
        }
        return 0;
    }

    public static int Main(string[] args)
    {
        try {
            if (args.Length != 1 || (args[0] != "--probe" && args[0] != "--probe-state" && args[0] != "--worker")) {
                Console.Error.WriteLine("TDJSON_HOST_USAGE");
                return 2;
            }
            return args[0] == "--probe" ? Probe() : args[0] == "--probe-state" ? ProbeUnauthorizedState() : Worker();
        }
        catch (DllNotFoundException) {
            Emit(new {kind="error",code="OFFICIAL_TDJSON_DLL_NOT_FOUND",loaded=false});
            return 31;
        }
        catch (EntryPointNotFoundException) {
            Emit(new {kind="error",code="OFFICIAL_TDJSON_ABI_MISMATCH",loaded=false});
            return 32;
        }
        catch (BadImageFormatException) {
            Emit(new {kind="error",code="OFFICIAL_TDJSON_ARCH_MISMATCH",loaded=false});
            return 33;
        }
        catch (Exception) {
            Emit(new {kind="error",code="NATIVE_TDLIB_PROBE_OR_WORKER_FAILED",loaded=false});
            return 34;
        }
    }
}
