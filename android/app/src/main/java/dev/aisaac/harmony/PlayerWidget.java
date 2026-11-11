package dev.aisaac.harmony;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.Base64;
import android.widget.RemoteViews;

import java.io.File;
import java.io.FileOutputStream;

/**
 * The Harmony on the home screen: the song playing, its cover and the
 * previous / play-pause / next buttons, in the theme's colour. The page
 * sends what to show (HarmonyPhonePlugin.updateWidget); the buttons go back
 * to the page as the same commands the player notification sends. With the
 * app closed, a button opens it (and play continues where it left off).
 */
public class PlayerWidget extends AppWidgetProvider {
    static final String ACTION = "dev.aisaac.harmony.WIDGET";
    static final String EXTRA_CMD = "dev.aisaac.harmony.WIDGET_CMD";
    private static final String PREFS = "harmony.widget";
    private static final String ART_FILE = "widget-art.jpg";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION.equals(intent.getAction())) return;
        String cmd = intent.getStringExtra(EXTRA_CMD);
        if (cmd == null) return;
        HarmonyPhonePlugin live = HarmonyPhonePlugin.instance;
        if (live != null) {
            live.widgetCommand(cmd);
            return;
        }
        // the app isn't running: open it, and the page carries the command out once the music is back
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(EXTRA_CMD, cmd);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            context.startActivity(open);
        } catch (Exception ignored) {
            // Android refused: tapping the cover still opens the app
        }
    }

    // ── state from the page ─────────────────────────────────────────────

    static void save(Context c, String title, String artist, boolean playing, int accent, int onAccent, String artBase64) {
        SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("title", title)
            .putString("artist", artist)
            .putBoolean("playing", playing)
            .putInt("accent", accent)
            .putInt("onAccent", onAccent);
        if (artBase64 != null) {
            File f = new File(c.getFilesDir(), ART_FILE);
            if (artBase64.isEmpty()) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            } else {
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(Base64.decode(artBase64, Base64.DEFAULT));
                } catch (Exception ignored) {
                    // the widget keeps the last cover
                }
            }
        }
        e.apply();
        render(c);
    }

    // ── drawing ─────────────────────────────────────────────────────────

    static void render(Context c) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        int[] ids = manager.getAppWidgetIds(new ComponentName(c, PlayerWidget.class));
        if (ids == null || ids.length == 0) return;

        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_player);
        String title = p.getString("title", null);
        v.setTextViewText(R.id.w_title, title != null ? title : "Harmony");
        v.setTextViewText(R.id.w_artist, p.getString("artist", c.getString(R.string.widget_idle)));
        v.setImageViewResource(R.id.w_play, p.getBoolean("playing", false) ? R.drawable.ic_w_pause : R.drawable.ic_w_play);
        v.setInt(R.id.w_play_bg, "setColorFilter", p.getInt("accent", 0xFF7C6CF4));
        v.setInt(R.id.w_play, "setColorFilter", p.getInt("onAccent", 0xFFFFFFFF));

        Bitmap art = roundedArt(c);
        if (art != null) v.setImageViewBitmap(R.id.w_cover, art);
        else v.setImageViewResource(R.id.w_cover, R.mipmap.ic_launcher);

        Intent open = new Intent(c, MainActivity.class);
        PendingIntent openPi = PendingIntent.getActivity(c, 7101, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_cover, openPi);
        v.setOnClickPendingIntent(R.id.w_title, openPi);
        v.setOnClickPendingIntent(R.id.w_artist, openPi);
        v.setOnClickPendingIntent(R.id.w_prev, command(c, "prev", 7102));
        v.setOnClickPendingIntent(R.id.w_play_box, command(c, "toggle", 7103));
        v.setOnClickPendingIntent(R.id.w_next, command(c, "next", 7104));

        manager.updateAppWidget(ids, v);
    }

    private static PendingIntent command(Context c, String cmd, int requestCode) {
        Intent i = new Intent(c, PlayerWidget.class);
        i.setAction(ACTION);
        i.putExtra(EXTRA_CMD, cmd);
        return PendingIntent.getBroadcast(c, requestCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** the saved cover with round corners (a widget can't clip an image itself) */
    private static Bitmap roundedArt(Context c) {
        File f = new File(c.getFilesDir(), ART_FILE);
        if (!f.exists()) return null;
        Bitmap src = BitmapFactory.decodeFile(f.getAbsolutePath());
        if (src == null) return null;
        int size = Math.min(src.getWidth(), src.getHeight());
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float r = size * 0.16f;
        canvas.drawRoundRect(new RectF(0, 0, size, size), r, r, paint);
        src.recycle();
        return out;
    }
}
