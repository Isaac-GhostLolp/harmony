package dev.aisaac.harmony;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/**
 * The musical alarm's clock: the time and the days live in SharedPreferences
 * (so the alarm survives the app being closed and the phone restarting), and
 * the next ring is handed to Android's AlarmManager as an alarm clock (it
 * shows in the status bar and rings on time even in Doze).
 *
 * days: a bitmask of Calendar.DAY_OF_WEEK (bit 1 = Sunday … bit 7 = Saturday);
 * 0 means "only once".
 */
public final class AlarmScheduler {
    static final String PREFS = "harmony.alarm";
    static final String EXTRA_ALARM = "dev.aisaac.harmony.ALARM";
    static final int RC_ALARM = 7001;
    static final int RC_SNOOZE = 7002;

    private AlarmScheduler() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** saves the alarm and schedules its next ring (or cancels it when off) */
    static long save(Context c, boolean enabled, int hour, int minute, int days) {
        prefs(c).edit()
            .putBoolean("enabled", enabled)
            .putInt("hour", hour)
            .putInt("minute", minute)
            .putInt("days", days)
            .apply();
        return schedule(c);
    }

    /** the next ring after now, from the saved settings (-1: none) */
    static long next(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("enabled", false)) return -1;
        int hour = p.getInt("hour", 7);
        int minute = p.getInt("minute", 0);
        int days = p.getInt("days", 0);
        long now = System.currentTimeMillis();
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        for (int i = 0; i < 8; i++) {
            if (cal.getTimeInMillis() > now) {
                int dow = cal.get(Calendar.DAY_OF_WEEK);
                if (days == 0 || (days & (1 << dow)) != 0) return cal.getTimeInMillis();
            }
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }

    /** (re)schedules the next ring; returns when it is (-1: off) */
    static long schedule(Context c) {
        long at = next(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = ringIntent(c, RC_ALARM);
        am.cancel(pi);
        if (at > 0) setAt(c, am, at, pi);
        return at;
    }

    /** rings again in `minutes` (the snooze), apart from the regular alarm */
    static long snooze(Context c, int minutes) {
        long at = System.currentTimeMillis() + minutes * 60_000L;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        setAt(c, am, at, ringIntent(c, RC_SNOOZE));
        return at;
    }

    static void cancelSnooze(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(ringIntent(c, RC_SNOOZE));
    }

    /** after a one-time alarm rang, it turns itself off */
    static void afterRing(Context c, boolean wasSnooze) {
        if (wasSnooze) return;
        if (prefs(c).getInt("days", 0) == 0) prefs(c).edit().putBoolean("enabled", false).apply();
        schedule(c);
    }

    private static void setAt(Context c, AlarmManager am, long at, PendingIntent pi) {
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exact) {
            // tapping the alarm icon in the status bar opens the Harmony
            PendingIntent show = PendingIntent.getActivity(
                c, 7003, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi);
        } else {
            // Android 12 without the exact-alarm permission: as close as Android allows
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static PendingIntent ringIntent(Context c, int requestCode) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.putExtra("snooze", requestCode == RC_SNOOZE);
        return PendingIntent.getBroadcast(c, requestCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
