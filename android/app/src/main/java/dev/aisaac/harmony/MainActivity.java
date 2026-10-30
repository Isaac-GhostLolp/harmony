package dev.aisaac.harmony;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** the most the system's font size may enlarge the app's text (percent) */
    private static final int MAX_TEXT_ZOOM = 115;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the Harmony's own plugin (the phone's music); the others register themselves
        registerPlugin(HarmonyMediaPlugin.class);
        super.onCreate(savedInstanceState);

        // A phone set to a very large font (some Samsungs) blew the layout apart:
        // the app still follows a bigger font, up to a point.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setTextZoom(Math.min(settings.getTextZoom(), MAX_TEXT_ZOOM));
        }
    }
}
