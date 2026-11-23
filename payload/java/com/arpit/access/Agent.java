package com.arpit.access;

import android.content.Context;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public final class Agent {
    public static volatile String WS_URL = "";
    public static volatile String BUILD_ID = "";
    public static volatile int W = 1080, H = 2400;
    public static volatile boolean screenOn = false;
    private static boolean loaded = false;

    public static synchronized void load(Context c) {
        if (loaded) return;
        loaded = true;
        try (InputStream in = c.getAssets().open("arpit.json")) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int r;
            while ((r = in.read(b)) > 0) bo.write(b, 0, r);
            JSONObject o = new JSONObject(bo.toString("UTF-8"));
            WS_URL = o.getString("url");
            BUILD_ID = o.getString("id");
        } catch (Exception ignored) {}
    }
}
