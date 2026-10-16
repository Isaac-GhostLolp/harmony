package dev.aisaac.harmony;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * The phone's music for the Harmony: the songs Android's MediaStore knows
 * about, and the cover inside each file. The library itself (SQLite) lives
 * in the WebView, shared with the desktop app (src/core).
 */
@CapacitorPlugin(
    name = "HarmonyMedia",
    permissions = {
        // Android 13+: music only, and the player notification
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        // Android 12 and older
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class HarmonyMediaPlugin extends Plugin {

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (getPermissionState(audioAlias()) == PermissionState.GRANTED) {
            askNotifications(call);
            return;
        }
        requestPermissionForAlias(audioAlias(), call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        askNotifications(call);
    }

    /** the notification permission is asked once, after the music one; music works without it */
    private void askNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        resolveAccess(call);
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        resolveAccess(call);
    }

    private void resolveAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState(audioAlias()) == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(readSongs());
            } catch (Exception e) {
                call.reject("Could not read the music on this phone: " + e.getMessage());
            }
        }).start();
    }

    private JSObject readSongs() {
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        boolean modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;

        List<String> columns = new ArrayList<>();
        columns.add(MediaStore.Audio.Media.DATA);
        columns.add(MediaStore.Audio.Media.TITLE);
        columns.add(MediaStore.Audio.Media.ARTIST);
        columns.add(MediaStore.Audio.Media.ALBUM);
        columns.add(MediaStore.Audio.Media.DURATION);
        columns.add(MediaStore.Audio.Media.TRACK);
        columns.add(MediaStore.Audio.Media.YEAR);
        if (modern) {
            columns.add(MediaStore.Audio.Media.ALBUM_ARTIST);
            columns.add(MediaStore.Audio.Media.GENRE);
        }

        JSArray songs = new JSArray();
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        try (Cursor c = resolver.query(uri, columns.toArray(new String[0]), selection, null, null)) {
            if (c != null) {
                int iPath = c.getColumnIndex(MediaStore.Audio.Media.DATA);
                int iTitle = c.getColumnIndex(MediaStore.Audio.Media.TITLE);
                int iArtist = c.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                int iAlbum = c.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                int iDuration = c.getColumnIndex(MediaStore.Audio.Media.DURATION);
                int iTrack = c.getColumnIndex(MediaStore.Audio.Media.TRACK);
                int iYear = c.getColumnIndex(MediaStore.Audio.Media.YEAR);
                int iAlbumArtist = modern ? c.getColumnIndex(MediaStore.Audio.Media.ALBUM_ARTIST) : -1;
                int iGenre = modern ? c.getColumnIndex(MediaStore.Audio.Media.GENRE) : -1;

                while (c.moveToNext()) {
                    String path = text(c, iPath);
                    if (path == null || !new File(path).exists()) continue;
                    JSObject s = new JSObject();
                    s.put("path", path);
                    s.put("title", text(c, iTitle));
                    s.put("artist", text(c, iArtist));
                    s.put("albumArtist", text(c, iAlbumArtist));
                    s.put("album", text(c, iAlbum));
                    s.put("genre", text(c, iGenre));
                    s.put("year", number(c, iYear));
                    s.put("trackNo", number(c, iTrack));
                    Long ms = number(c, iDuration);
                    s.put("duration", ms == null ? 0 : ms / 1000.0);
                    songs.put(s);
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("songs", songs);
        return ret;
    }

    private static String text(Cursor c, int i) {
        if (i < 0 || c.isNull(i)) return null;
        return c.getString(i);
    }

    private static Long number(Cursor c, int i) {
        if (i < 0 || c.isNull(i)) return null;
        return c.getLong(i);
    }

    /** items: [{ key, path }] → paths: { key: image file or null } */
    @PluginMethod
    public void covers(final PluginCall call) {
        final JSArray items = call.getArray("items");
        if (items == null) {
            call.reject("items is required");
            return;
        }
        new Thread(() -> {
            JSObject paths = new JSObject();
            File dir = new File(getContext().getFilesDir(), "covers");
            if (!dir.exists()) dir.mkdirs();
            try {
                JSONArray list = items;
                for (int i = 0; i < list.length(); i++) {
                    JSONObject item = list.getJSONObject(i);
                    String key = item.getString("key");
                    String file = coverOf(item.getString("path"), new File(dir, key.replaceAll("[^A-Za-z0-9_-]", "_")));
                    if (file == null) paths.put(key, JSONObject.NULL);
                    else paths.put(key, file);
                }
                JSObject ret = new JSObject();
                ret.put("paths", paths);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not read covers: " + e.getMessage());
            }
        }).start();
    }

    /** the picture embedded in the song, written next to `base` with the right extension */
    private static String coverOf(String songPath, File base) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(songPath);
            byte[] art = r.getEmbeddedPicture();
            if (art == null || art.length == 0) return null;
            boolean png = art.length > 4 && (art[0] & 0xFF) == 0x89 && art[1] == 'P' && art[2] == 'N' && art[3] == 'G';
            File out = new File(base.getPath() + (png ? ".png" : ".jpg"));
            try (FileOutputStream os = new FileOutputStream(out)) {
                os.write(art);
            }
            return out.getAbsolutePath();
        } catch (Exception e) {
            return null;
        } finally {
            try {
                r.release();
            } catch (Exception ignored) {
                // nothing to free
            }
        }
    }
}
