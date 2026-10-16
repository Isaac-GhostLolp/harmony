package dev.aisaac.harmony;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the Harmony's own plugin (the phone's music); the others register themselves
        registerPlugin(HarmonyMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
