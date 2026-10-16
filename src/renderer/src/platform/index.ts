import { Capacitor } from '@capacitor/core'

/** Running as the Android app (Capacitor), not the desktop one (Electron).
 * In development, `?android` in the URL runs the Android app in a browser. */
export const IS_ANDROID =
  Capacitor.getPlatform() === 'android' ||
  (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('android'))

/** A local file as a URL the page can load: through the harmony:// protocol
 * on the desktop, through Capacitor's local server on Android. */
export function fileUrl(path: string): string {
  return IS_ANDROID ? Capacitor.convertFileSrc(path) : `harmony://media/?path=${encodeURIComponent(path)}`
}
