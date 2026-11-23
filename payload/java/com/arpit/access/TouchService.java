package com.arpit.access;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

public class TouchService extends AccessibilityService {
    public static volatile TouchService alive;

    @Override protected void onServiceConnected() { alive = this; }
    @Override public void onDestroy() { alive = null; super.onDestroy(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) {}
    @Override public void onInterrupt() {}

    public static void tap(float x, float y) {
        Path p = new Path();
        p.moveTo(x, y);
        gesture(p, 0, 60);
    }

    public static void swipe(float x1, float y1, float x2, float y2, long ms) {
        Path p = new Path();
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
        gesture(p, 0, ms);
    }

    public static void longPress(float x, float y) {
        Path p = new Path();
        p.moveTo(x, y);
        gesture(p, 0, 700);
    }

    private static void gesture(Path p, long start, long dur) {
        TouchService s = alive;
        if (s == null) return;
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(p, start, dur));
        s.dispatchGesture(b.build(), null, null);
    }

    public static boolean type(String text) {
        TouchService s = alive;
        if (s == null) return false;
        AccessibilityNodeInfo n = s.getRootInActiveWindow();
        if (n == null) return false;
        AccessibilityNodeInfo f = n.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null) return false;
        android.os.Bundle args = new android.os.Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    public static void global(int action) {
        TouchService s = alive;
        if (s != null) s.performGlobalAction(action);
    }

    public static boolean lockScreen() {
        if (Build.VERSION.SDK_INT >= 28) { global(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN); return true; }
        return false;
    }
}
