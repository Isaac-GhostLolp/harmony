package dev.aisaac.harmony;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** the most the system's font size may enlarge the app's text (percent) */
    private static final int MAX_TEXT_ZOOM = 115;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the Harmony's own plugins (the phone's music; the phone itself); the others register themselves
        registerPlugin(HarmonyMediaPlugin.class);
        registerPlugin(HarmonyPhonePlugin.class);
        takeAlarm(getIntent());
        super.onCreate(savedInstanceState);

        // A phone set to a very large font (some Samsungs) blew the layout apart:
        // the app still follows a bigger font, up to a point.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setTextZoom(Math.min(settings.getTextZoom(), MAX_TEXT_ZOOM));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        takeAlarm(intent);
        super.onNewIntent(intent);
    }

    /** opened by the musical alarm: wake the screen and show over the lock screen */
    private void takeAlarm(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(AlarmScheduler.EXTRA_ALARM, false)) return;
        intent.removeExtra(AlarmScheduler.EXTRA_ALARM);
        HarmonyPhonePlugin.pendingAlarm = true;
        showOverLockScreen(this, true);
    }

    static void showOverLockScreen(Activity a, boolean on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            a.setShowWhenLocked(on);
            a.setTurnScreenOn(on);
        } else {
            int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (on) a.getWindow().addFlags(flags);
            else a.getWindow().clearFlags(flags);
        }
        if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
