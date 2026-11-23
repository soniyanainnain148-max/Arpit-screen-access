package com.arpit.access;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class ScreenStreamer {
    public interface Sink { void frame(byte[] jpeg, int w, int h); }

    private MediaProjection proj;
    private VirtualDisplay vd;
    private ImageReader reader;
    private HandlerThread th;
    private Handler h;
    private final Sink sink;
    private final int quality;
    private volatile long last = 0;
    private volatile long gap = 200;

    public ScreenStreamer(Context c, Sink sink, int quality) {
        this.sink = sink;
        this.quality = quality;
    }

    public boolean start() {
        try {
            MediaProjectionManager m = (MediaProjectionManager) ctx().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            proj = m.getMediaProjection(AgentService.projectionResult, AgentService.projectionData);
            th = new HandlerThread("cap");
            th.start();
            h = new Handler(th.getLooper());
            reader = ImageReader.newInstance(Agent.W, Agent.H, PixelFormat.RGBA_8888, 2);
            reader.setOnImageAvailableListener(this::onImage, h);
            vd = proj.createVirtualDisplay("arpit", Agent.W, Agent.H, 160,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, h);
            return true;
        } catch (Exception e) { return false; }
    }

    private Context ctx() { return AgentService.get(); }

    private void onImage(ImageReader r) {
        Image img = r.acquireLatestImage();
        if (img == null) return;
        long now = System.currentTimeMillis();
        if (now - last < gap) { img.close(); return; }
        last = now;
        try {
            Image.Plane pl = img.getPlanes()[0];
            ByteBuffer buf = pl.getBuffer();
            int px = pl.getPixelStride(), rw = pl.getRowStride();
            Bitmap bmp = Bitmap.createBitmap(rw / px, Agent.H, Bitmap.Config.ARGB_8888);
            bmp.copyPixelsFromBuffer(buf);
            Bitmap crop = Bitmap.createBitmap(bmp, 0, 0, Agent.W, Agent.H);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            crop.compress(Bitmap.CompressFormat.JPEG, quality, bo);
            sink.frame(bo.toByteArray(), Agent.W, Agent.H);
            bmp.recycle(); crop.recycle();
        } catch (Exception ignored) {}
        img.close();
    }

    public void stop() {
        try { if (vd != null) vd.release(); } catch (Exception ignored) {}
        try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        try { if (proj != null) proj.stop(); } catch (Exception ignored) {}
        try { if (th != null) th.quitSafely(); } catch (Exception ignored) {}
        proj = null; vd = null; reader = null;
    }
}
