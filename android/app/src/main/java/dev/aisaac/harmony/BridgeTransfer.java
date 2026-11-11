package dev.aisaac.harmony;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The bridge's file transfers, on the phone: a song from the PC saved into
 * Music/Harmony (through MediaStore, so Android lists it as music right
 * away), and a song from the phone sent to the PC. Plain HTTP on the home
 * network, the six-digit code in a header. Runs off the main thread.
 */
final class BridgeTransfer {
    static final String FOLDER = "Harmony";
    private static final int TIMEOUT_MS = 20_000;

    private BridgeTransfer() {}

    private static String mime(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".flac")) return "audio/flac";
        if (n.endsWith(".m4a") || n.endsWith(".aac")) return "audio/mp4";
        if (n.endsWith(".ogg")) return "audio/ogg";
        if (n.endsWith(".wav")) return "audio/wav";
        return "audio/mpeg";
    }

    private static String safeName(String name) {
        String s = name.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]", "_").trim();
        if (s.length() > 150) s = s.substring(0, 150);
        return s.isEmpty() ? "song.mp3" : s;
    }

    private static HttpURLConnection open(String url, String code, String device) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS * 3);
        c.setRequestProperty("x-harmony-code", code);
        c.setRequestProperty("x-harmony-device", device);
        return c;
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    /** downloads `url` into Music/Harmony as `name`; returns the file's path */
    static String download(Context ctx, String url, String code, String device, String name) throws IOException {
        HttpURLConnection c = open(url, code, device);
        int status = c.getResponseCode();
        if (status != 200) {
            c.disconnect();
            throw new IOException("HTTP " + status);
        }
        String file = safeName(name);
        try (InputStream in = c.getInputStream()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return saveToMediaStore(ctx, in, file);
            return saveToFolder(ctx, in, file);
        } finally {
            c.disconnect();
        }
    }

    /** Android 10+: no storage permission needed for the app's own new files */
    private static String saveToMediaStore(Context ctx, InputStream in, String file) throws IOException {
        ContentResolver r = ctx.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Audio.Media.DISPLAY_NAME, file);
        v.put(MediaStore.Audio.Media.MIME_TYPE, mime(file));
        v.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/" + FOLDER);
        v.put(MediaStore.Audio.Media.IS_PENDING, 1);
        Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = r.insert(collection, v);
        if (item == null) throw new IOException("could not create the file");
        try (OutputStream out = r.openOutputStream(item)) {
            if (out == null) throw new IOException("could not write the file");
            copy(in, out);
        } catch (IOException e) {
            r.delete(item, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Audio.Media.IS_PENDING, 0);
        r.update(item, done, null, null);
        // its real path (the library is keyed by path, like the scan's)
        try (Cursor cur = r.query(item, new String[] { MediaStore.Audio.Media.DATA }, null, null, null)) {
            if (cur != null && cur.moveToFirst()) return cur.getString(0);
        }
        return Environment.getExternalStorageDirectory() + "/" + Environment.DIRECTORY_MUSIC + "/" + FOLDER + "/" + file;
    }

    /** Android 8–9: a plain file in Music/Harmony, then a scan so MediaStore lists it */
    private static String saveToFolder(Context ctx, InputStream in, String file) throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), FOLDER);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File target = new File(dir, file);
        String stem = file.contains(".") ? file.substring(0, file.lastIndexOf('.')) : file;
        String ext = file.contains(".") ? file.substring(file.lastIndexOf('.')) : "";
        for (int i = 2; target.exists(); i++) target = new File(dir, stem + " (" + i + ")" + ext);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        CountDownLatch scanned = new CountDownLatch(1);
        MediaScannerConnection.scanFile(ctx, new String[] { target.getAbsolutePath() }, null, (p, u) -> scanned.countDown());
        try {
            scanned.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return target.getAbsolutePath();
    }

    /** sends the file at `path` to the PC (`base` is "http://ip:port") */
    static void upload(String base, String code, String device, String path) throws IOException {
        File f = new File(path);
        if (!f.isFile()) throw new IOException("file not found");
        String url = base + "/bridge/upload?name=" + URLEncoder.encode(f.getName(), "UTF-8");
        HttpURLConnection c = open(url, code, device);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setFixedLengthStreamingMode(f.length());
        c.setRequestProperty("Content-Type", "application/octet-stream");
        try (InputStream in = new FileInputStream(f); OutputStream out = c.getOutputStream()) {
            copy(in, out);
        }
        int status = c.getResponseCode();
        c.disconnect();
        if (status != 200) throw new IOException("HTTP " + status);
    }
}
