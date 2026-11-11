package dev.aisaac.harmony;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Time to wake up: opens the Harmony over the lock screen (through a
 * full-screen notification, the way Android lets alarm clocks do it), where
 * the page starts the chosen music, softly at first. The next ring of a
 * repeating alarm is scheduled right away. Restarting the phone (or the
 * clock changing) puts the alarm back.
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String CHANNEL = "harmony.alarm";
    static final int NOTIFICATION_ID = 7010;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            AlarmScheduler.schedule(context);
            return;
        }

        AlarmScheduler.afterRing(context, intent.getBooleanExtra("snooze", false));

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(AlarmScheduler.EXTRA_ALARM, true);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 7004, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Despertador", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("O despertador musical do Harmony");
            ch.setSound(null, null); // the music is the sound
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder n = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle("Bom dia! ☀️")
            .setContentText("Toque para abrir o Harmony")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .setAutoCancel(true);
        try {
            nm.notify(NOTIFICATION_ID, n.build());
        } catch (SecurityException ignored) {
            // notifications off: the direct start below is the only way left
        }

        // with the screen on (or the notification blocked), try to open it straight away
        try {
            context.startActivity(open);
        } catch (Exception ignored) {
            // Android refused a start from the background: the notification is there
        }
    }
}
