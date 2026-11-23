package com.arpit.access;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/** Invisible activity: MediaProjection grant → phir accessibility settings. */
public class ConnectActivity extends Activity {
    private static final int REQ = 1001;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Agent.load(this);
        MediaProjectionManager m = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(m.createScreenCaptureIntent(), REQ);
    }

    @Override protected void onActivityResult(int rq, int rc, Intent data) {
        if (rq == REQ && rc == RESULT_OK) {
            AgentService.projectionData = data;
            AgentService.projectionResult = rc;
            AgentService.start(this);
            if (!TouchService.alive) {
                Toast.makeText(this, "Enable \"" + getLabel() + "\" in Accessibility", Toast.LENGTH_LONG).show();
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        }
        finish();
    }

    private String getLabel() {
        try {
            return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(getPackageName(), 0)).toString();
        } catch (Exception e) { return "service"; }
    }
}
