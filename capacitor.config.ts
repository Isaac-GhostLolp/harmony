import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.aisaac.harmony',
  appName: 'Harmony',
  webDir: 'dist-android',
  backgroundColor: '#0b0b10',
  android: {
    // the app's own pages only; nothing is loaded from the web
    allowMixedContent: false
  },
  plugins: {
    // online lookups (lyrics, covers) go through the native HTTP stack, free of CORS
    CapacitorHttp: { enabled: true }
  }
}

export default config
