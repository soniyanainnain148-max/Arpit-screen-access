package com.arpit.access;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int REQ = 1002;
    private TextView status;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Agent.load(this);
        build();
        if (Build.VERSION.SDK_INT >= 33)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 9);
    }

    @Override protected void onResume() {
        super.onResume();
        refresh();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private Button btn(String text, int color) {
        Button x = new Button(this);
        x.setText(text);
        x.setAllCaps(false);
        x.setTextSize(15);
        x.setTextColor(color);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.bottomMargin = dp(10);
        x.setLayoutParams(lp);
        return x;
    }

    private void build() {
        ScrollView sc = new ScrollView(this);
        sc.setBackgroundColor(Color.parseColor("#0A0B0D"));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(34), dp(22), dp(34));
        sc.addView(root);

        TextView t = new TextView(this);
        t.setText("REMOTE ACCESS");
        t.setTextColor(Color.parseColor("#EDF1F5"));
        t.setTextSize(24);
        t.setGravity(Gravity.START);
        root.addView(t);

        TextView s = new TextView(this);
        s.setText("Device setup");
        s.setTextColor(Color.parseColor("#7B8694"));
        s.setTextSize(13);
        s.setPadding(0, dp(4), 0, dp(24));
        root.addView(s);

        status = new TextView(this);
        status.setTextSize(13);
        status.setTextColor(Color.parseColor("#C9D2DC"));
        status.setPadding(dp(14), dp(14), dp(14), dp(14));
        status.setBackgroundColor(Color.parseColor("#121418"));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2);
        slp.bottomMargin = dp(18);
        status.setLayoutParams(slp);
        root.addView(status);

        Button screen = btn("1. Allow screen capture", Color.parseColor("#0A0B0D"));
        screen.setBackgroundColor(Color.parseColor("#C6F24E"));
        screen.setOnClickListener(v -> {
            MediaProjectionManager m = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            startActivityForResult(m.createScreenCaptureIntent(), REQ);
        });
        root.addView(screen);

        Button acc = btn("2. Enable accessibility service", Color.parseColor("#EDF1F5"));
        acc.setBackgroundColor(Color.parseColor("#1A1E24"));
        acc.setOnClickListener(v ->
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        root.addView(acc);

        Button start = btn("3. Start service", Color.parseColor("#EDF1F5"));
        start.setBackgroundColor(Color.parseColor("#1A1E24"));
        start.setOnClickListener(v -> {
            AgentService.start(this);
            refresh();
        });
        root.addView(start);

        Button stop = btn("Stop", Color.parseColor("#8A94A2"));
        stop.setBackgroundColor(Color.parseColor("#14171B"));
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, AgentService.class));
            refresh();
        });
        root.addView(stop);

        TextView hint = new TextView(this);
        hint.setText("Screen capture aur accessibility dono on hone ke baad service khud chalti rehti hai. Reboot pe bhi wapas uthti hai.");
        hint.setTextColor(Color.parseColor("#5D6773"));
        hint.setTextSize(12);
        hint.setPadding(0, dp(18), 0, 0);
        root.addView(hint);

        setContentView(sc);
    }

    private void refresh() {
        StringBuilder sb = new StringBuilder();
        sb.append(Agent.screenOn ? "Screen: ON" : "Screen: off").append('\n');
        sb.append(TouchService.alive ? "Accessibility: ON" : "Accessibility: off").append('\n');
        sb.append(AgentService.connected ? "Server: connected" : "Server: not connected").append('\n');
        sb.append(Agent.WS_URL.isEmpty() ? "Config: missing arpit.json" : "Config: ok");
        if (status != null) status.setText(sb.toString());
    }

    @Override protected void onActivityResult(int rq, int rc, Intent data) {
        if (rq == REQ && rc == RESULT_OK) {
            AgentService.projectionData = data;
            AgentService.projectionResult = rc;
            AgentService.start(this);
            new android.os.Handler(android.os.Looper.getMainLooper())
                    .postDelayed(this::refresh, 1500);
        }
    }
                        }
