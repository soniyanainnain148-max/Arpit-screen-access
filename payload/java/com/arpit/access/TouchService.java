package com.arpit.access;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

public class TouchService extends AccessibilityService {
    public static volatile boolean alive = false;
    private static TouchService self;

    @Override protected void onServiceConnected() {
        alive = true;
        self = this;
    }

    public static void tap(float x, float y) { swipe(x, y, x, y, 40); }

    public static void longPress(float x, float y) { swipe(x, y, x, y, 600); }

    public static void swipe(float x1, float y1, float x2, float y2, long ms) {
        TouchService s = self;
        if (s == null) return;
        try {
            Path p = new Path();
            p.moveTo(x1, y1);
            if (x1 != x2 || y1 != y2) p.lineTo(x2, y2);
            GestureDescription.Builder b = new GestureDescription.Builder();
            b.addStroke(new GestureDescription.StrokeDescription(p, 0, Math.max(ms, 1)));
            s.dispatchGesture(b.build(), null, null);
        } catch (Exception ignored) {}
    }

    public static boolean type(String t) {
        TouchService s = self;
        if (s == null) return false;
        try {
            AccessibilityNodeInfo root = s.getRootInActiveWindow();
            if (root == null) return false;
            AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (f == null) return false;
            Bundle args = new Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t);
            return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        } catch (Exception e) { return false; }
    }

    public static void global(int action) {
        TouchService s = self;
        if (s == null) return;
        try { s.performGlobalAction(action); } catch (Exception ignored) {}
    }

    public static boolean lockScreen() {
        TouchService s = self;
        if (s == null || Build.VERSION.SDK_INT < 28) return false;
        try { return s.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN); } catch (Exception e) { return false; }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) {}

    @Override public void onInterrupt() { alive = false; }

    @Override public void onDestroy() {
        alive = false;
        self = null;
        super.onDestroy();
    }
}
