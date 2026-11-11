package dev.aisaac.harmony;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.BatteryManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone itself, for the Harmony's everyday features: the media volume
 * and whether it goes to headphones (ear care), the battery (automatic
 * saving) and the musical alarm (AlarmScheduler / AlarmReceiver).
 */
@CapacitorPlugin(name = "HarmonyPhone")
public class HarmonyPhonePlugin extends Plugin {
    /** set when the Harmony was opened by the alarm, until the page takes it */
    static volatile boolean pendingAlarm = false;

    // ── volume and headphones ───────────────────────────────────────────

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private boolean headphonesOn(AudioManager am) {
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || t == AudioDeviceInfo.TYPE_USB_HEADSET
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && t == AudioDeviceInfo.TYPE_BLE_HEADSET)) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void audioInfo(PluginCall call) {
        AudioManager am = audio();
        JSObject r = new JSObject();
        r.put("volume", am.getStreamVolume(AudioManager.STREAM_MUSIC));
        r.put("max", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        r.put("headphones", headphonesOn(am));
        call.resolve(r);
    }

    /** sets the media volume (steps of the phone's own scale), showing the system's slider */
    @PluginMethod
    public void setVolume(PluginCall call) {
        AudioManager am = audio();
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int v = Math.max(0, Math.min(max, call.getInt("volume", 0)));
        boolean show = Boolean.TRUE.equals(call.getBoolean("show", false));
        try {
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v, show ? AudioManager.FLAG_SHOW_UI : 0);
        } catch (SecurityException ignored) {
            // "Do not disturb" may forbid it
        }
        call.resolve();
    }

    // ── battery ─────────────────────────────────────────────────────────

    @PluginMethod
    public void battery(PluginCall call) {
        // the last battery broadcast is sticky: no receiver needed to read it
        Intent b = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        JSObject r = new JSObject();
        int level = b != null ? b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) : -1;
        int scale = b != null ? b.getIntExtra(BatteryManager.EXTRA_SCALE, 100) : 100;
        int status = b != null ? b.getIntExtra(BatteryManager.EXTRA_STATUS, -1) : -1;
        r.put("level", level < 0 ? -1 : Math.round(level * 100f / scale));
        r.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
        call.resolve(r);
    }

    // ── the musical alarm ───────────────────────────────────────────────

    private JSObject alarmState(long next) {
        android.content.SharedPreferences p = AlarmScheduler.prefs(getContext());
        JSObject r = new JSObject();
        r.put("enabled", p.getBoolean("enabled", false));
        r.put("hour", p.getInt("hour", 7));
        r.put("minute", p.getInt("minute", 0));
        r.put("days", p.getInt("days", 0));
        r.put("next", next > 0 ? next : null);
        return r;
    }

    @PluginMethod
    public void getAlarm(PluginCall call) {
        call.resolve(alarmState(AlarmScheduler.next(getContext())));
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        long next = AlarmScheduler.save(
            getContext(),
            Boolean.TRUE.equals(call.getBoolean("enabled", true)),
            call.getInt("hour", 7),
            call.getInt("minute", 0),
            call.getInt("days", 0));
        call.resolve(alarmState(next));
    }

    @PluginMethod
    public void snooze(PluginCall call) {
        long at = AlarmScheduler.snooze(getContext(), call.getInt("minutes", 9));
        JSObject r = new JSObject();
        r.put("at", at);
        call.resolve(r);
    }

    /** true once if the Harmony was opened by the alarm (the page then starts the music) */
    @PluginMethod
    public void consumeAlarm(PluginCall call) {
        JSObject r = new JSObject();
        r.put("fired", pendingAlarm);
        pendingAlarm = false;
        call.resolve(r);
    }

    /** the alarm was stopped or snoozed: the app no longer shows over the lock screen */
    @PluginMethod
    public void alarmDone(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(AlarmReceiver.NOTIFICATION_ID);
        Activity a = getActivity();
        if (a != null) {
            a.runOnUiThread(() -> MainActivity.showOverLockScreen(a, false));
        }
        call.resolve();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // MainActivity already took the alarm out of the intent and set the flag
        if (pendingAlarm) notifyListeners("alarm", new JSObject(), true);
    }
}
