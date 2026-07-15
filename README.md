<div align="center">

# 🎵 Harmony

**A modern, open-source offline music player with a cinematic live-stage visualizer.**

The elegance of a streaming app, the freedom of your own local library — plus a Visualizer that turns any song into a festival mainstage, a Daft Punk pyramid, a synthwave city and more.

[![CI](https://github.com/Isaac-GhostLolp/harmony/actions/workflows/ci.yml/badge.svg)](https://github.com/Isaac-GhostLolp/harmony/actions/workflows/ci.yml)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-informational)
![License](https://img.shields.io/badge/license-MIT-green)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)

</div>

---

## ✨ Highlights

- **Your library, beautifully** — import folders (or drag & drop), automatic metadata + cover extraction, albums, artists, playlists, favorites, history and stats.
- **Real audio engine** — custom Web Audio graph with a 10-band equalizer, crossfade and gapless dual-slot playback.
- **Lyrics, three ways** — synced, karaoke (word-painted) and a calm TikTok-style *Edit* mode; fetched online (LRCLIB) or from local `.lrc` files.
- **Online metadata** — covers and lyrics from public providers (Deezer, iTunes, MusicBrainz, LRCLIB) with smart variant filtering (slowed/remix/live never mismatch).
- **The Visualizer** — a real lighting director (show states, emotion, selective impacts, choreographed lasers) rendering **six Show Packs**: 🎧 Festival · 🔺 Pyramid · 🌌 Cyber Arena · 🌲 Nature Pulse · 🌃 Synthwave City · 🚀 Space Odyssey.
- **Extras** — 6 themes + dynamic album accent, mini player, Discord Rich Presence, global search.

> Runs on **Windows** and **Linux** today. An Android version is planned.

## 🚀 Install

Grab an installer from the [**Releases**](https://github.com/Isaac-GhostLolp/harmony/releases) page:
- **Windows** — `Harmony-<version>-win-x64-Setup.exe` (installer) or `Harmony-<version>-win-x64-Portable.exe`
- **Linux** — `Harmony-<version>-linux-x86_64.AppImage` (make it executable and run) or the `.deb`

Or build it yourself — see **Getting started** below.

## Getting started

```bash
npm install        # also rebuilds better-sqlite3 for Electron (postinstall)
npm run dev        # development with hot reload
npm run typecheck  # strict TS check for main + renderer
npm run package    # production build (electron-builder)
```

> **Windows note:** `better-sqlite3` is a native module. If `npm install` fails on the rebuild step, install the VS Build Tools ("Desktop development with C++") or run `npx electron-builder install-app-deps` manually.

> **Linux note (Ubuntu 23.10+):** the kernel restricts unprivileged user namespaces, causing the classic `SUID sandbox helper... chrome-sandbox is owned by root and has mode 4755` crash. The Chromium zygote spawns before the main script runs, so this can only be fixed on the command line — `npm run dev` already passes `--no-sandbox` (development only; packaged builds keep full sandboxing). To develop WITH the sandbox instead, pick one:
> ```bash
> # A) fix helper perms (resets on every npm install)
> sudo chown root:root node_modules/electron/dist/chrome-sandbox
> sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
> npm run dev:sandboxed
>
> # B) re-allow unprivileged user namespaces system-wide
> sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
> npm run dev:sandboxed
> ```

## Architecture

```
src/
  main/                 # Electron main process (Node)
    db/database.ts      # SQLite (better-sqlite3, WAL) + schema
    services/scanner.ts # Folder walker + music-metadata + cover extraction
    ipc/handlers.ts     # All IPC endpoints (library, playlists, favorites, ...)
    index.ts            # Window + harmony:// protocol (streams local audio/covers)
  preload/index.ts      # contextBridge → typed window.harmony API
  renderer/src/         # React app (sandboxed, no Node access)
    store/              # Zustand: playerStore (queue/shuffle/repeat), uiStore
    services/audioEngine.ts  # Custom Web Audio engine (EQ, crossfade, dual-slot)
    services/stageDirector.ts # Visualizer brain: interprets music into a show
    pages/visualizer/        # Show Packs + LED-wall animation library
    hooks/useAudioPlayer.ts  # Bridges the Zustand store to the audio engine
    components/         # Sidebar, PlayerBar, QueuePanel, SongList, ...
    pages/              # Library, Albums, Artists, Playlists, Favorites,
                        # History, Search, Stats, Settings
    utils/color.ts      # Dominant-color extraction → dynamic accent
    styles/globals.css  # Theme tokens (6 themes) + glassmorphism
```

### Design decisions worth knowing

- **`harmony://` protocol** — the renderer is fully sandboxed (`contextIsolation`, no `nodeIntegration`). Audio files and covers are streamed through a privileged custom protocol instead of disabling `webSecurity`. This is the secure way to play local files.
- **Store-driven audio** — `useAudioPlayer` is mounted once and is the *only* place that touches the audio engine. UI components only mutate the Zustand store. No duplicated players, no ghost audio.
- **Theme tokens** — components never hardcode colors; they consume CSS variables. Adding a theme = adding one CSS block. `--accent` is overridden at runtime from the current album cover (the app's signature ambient glow).
- **Covers cached once per album** in `userData/covers`, keyed by md5 of `album::artist`.

## Implemented (v0.2)

**Core (v0.1)**
- Library import (folder picker + drag-and-drop of files/folders) with scan progress
- Metadata extraction (title, artist, album, genre, year, duration, track, cover) → SQLite
- Formats: MP3, FLAC, WAV, OGG, AAC, M4A
- Full playback: play/pause/next/prev, seek, volume (persisted), shuffle, repeat (off/all/one)
- Queue panel: play next, add to queue, remove, drag-to-reorder
- Playlists: create, rename, duplicate, delete, add/remove songs
- Favorites, History (recently played), Stats (Wrapped-style panel)
- Real-time debounced search across songs/albums/artists/playlists
- 6 themes (Dark, Light, AMOLED, Cyberpunk, GhostGuard, Pixel Art) + dynamic accent from album art

**Phase 2 (v0.2)**
- **Custom audio engine** (`services/audioEngine.ts`): dual `<audio>` slots → Web Audio graph. Replaces Howler entirely
- **10-band equalizer** (31Hz–16kHz) with presets: Flat, Rock, Pop, Bass Boost, Clássica, Podcast, Personalizado
- **Crossfade** (0–12s, configurable): next track ramps up in the idle slot while the current ramps down
- **Synced lyrics**: sidecar `.lrc` files (same name, same folder), click-to-seek, auto-scroll overlay
- **Mini player**: frameless always-on-top window mirroring state via IPC (zero audio duplication)
- **Discord Rich Presence**: "Listening to …" with track progress (paste your Application ID in Settings)
- **Playlist drag-and-drop ordering** (persisted via `playlists:reorder`)
- **Dynamic background**: blurred current-album-cover layer (toggle in Settings)
- **harmony:// protocol with HTTP Range support** — precise seeking, correct `ended` events, CORS for Web Audio/canvas

**Phase 3 (v0.3)**
- **Online metadata search** across public providers, no API keys needed:
  - Lyrics: **LRCLIB** (synced .lrc) → **lyrics.ovh** (plain fallback)
  - Covers/albums: **Deezer** → **iTunes Search** → **MusicBrainz + Cover Art Archive**
- **Variant-aware matching**: a plain track never matches a `slowed`, `remix`, `live`, `acoustic`, `nightcore`, `sped up` (etc.) edition — and vice-versa. `feat`/`remaster` are treated as soft (non-blocking). Scoring combines normalized title/artist similarity (Levenshtein) + duration proximity, threshold 0.62 (`services/online.ts`)
- **Lyrics resolution pipeline**: sidecar `.lrc` → SQLite cache (`lyrics_cache`, 3-day negative-cache) → online providers
- **Auto cover fetch**: songs without embedded art get covers (and album/year enrichment) automatically when played
- **Karaoke mode**: the active line is painted as it's sung — word-accurate when the LRC has enhanced `<mm:ss.xx>` word timestamps, interpolated between lines otherwise
- **Edit mode**: calm TikTok-edit ambience — spinning vinyl with the album cover, gently floating, with phrases drifting in/out (blur + slide via Framer Motion)
- 60fps lyric clock (`useSmoothTime`): interpolates the 4Hz store time with rAF, only while the overlay is open
- Master **"Busca online"** toggle in Settings for a fully-offline experience

**Phase 4 (v0.4)**
- **YouTube-style title cleaning**: "(Official Video)", "[OFFICIAL LYRIC VIDEO]", "(Official Audio)", "M/V", "visualizer", "legendado" etc. are stripped from search queries
- **Multi-attempt query derivation**: "Artist - Title" patterns inside the title are parsed (metadata artist is often just the channel name — VEVO, "rum world"…), including the reversed "Title - Artist" interpretation; feat segments are cut from queries
- **Speed-variant relaxation for covers**: a "slowed + reverb" file gets the original recording's artwork (identical art), while lyrics stay strict so sync timing is never wrong
- **Lyrics priority flipped**: online providers first (better-synced), sidecar `.lrc` as fallback — and the sidecar reader now tries `song.lrc`, `song.LRC` and `song.mp3.lrc`, stripping BOM
- **Library refresh**: one click re-scans all imported folders for new files and removes songs whose files vanished from disk (orphan albums/artists pruned)
- **Delete songs**: context menu — "Remover da biblioteca" (keeps the file) or "Excluir do dispositivo" (sends file + sidecar .lrc to the system **trash**, never a hard delete)
- **Edit mode redesigned** after the reference: near-black room, glowing serif italic phrases drifting in slow waves (right-aligned, left of the disc), translucent CD with light sheen, fine grooves and see-through spindle, accent-colored halo, 22s spin

**Phase 5 (v0.5)**
- **Cinema mode** (new sidebar tab): a canvas-rendered DJ mega-stage whose lights follow the music through the engine's `AnalyserNode` — LED wall driven by the spectrum, 8 moving-head beams swinging with the bass, booth with live mini-spectrum, bouncing crowd silhouette, beat-triggered strobes. Dark when nothing plays; the rig wakes with the first beat and fades out when paused
- **Punk mode** 🤖: secret Cinema variation — type `arthur` (or `punk`) on the Cinema page to unlock the Daft Punk *Alive 2007* pyramid: glowing edges pulsing with the kick, rising scanlines, red/white LED backwall, the two robots at the summit console. Made for Arthur; stays unlocked (toggle button appears)
- **Edit mode timing fixed**: phrases now look ahead by the transition duration (~0.65s) and transitions are snappier, so each line finishes materializing exactly when the singer starts it
- **Re-sync online**: song menu → "Sincronizar capa e letra online" forces a fresh provider search (cache bypassed); the lyrics overlay also gained a re-search button
- **Cover source picker**: original embedded art and online art now live side by side in the DB — song menu → "Capa: usar original (metadados)" / "Capa: usar da internet" (per-album preference; the original is never overwritten)
- **App icon slot**: drop the official 512×512 logo at `resources/icon.png` — electron-builder picks it up for all platforms and the dev window uses it directly (a placeholder gradient-H ships until then)

**Phase 6 (v0.6)**
- **Official Harmony logo** installed at `resources/icon.png` (512², full-res kept as `icon-full.png`) — used by electron-builder for all platforms and by the dev window
- **Cinema → Visualizer**, rebuilt as a full effects engine:
  - Real beat detection (instant bass vs rolling average) driving strobes, spark-particle bursts, camera shake and a bass-pumped vignette
  - LED wall with 4 auto-cycling patterns (spectrum columns, radial pulse, scrolling waves, beat checkerboard) crossfaded every ~14s or on drops
  - 10 moving heads in counter-swinging groups with hue-cycling beams, flicker and floor light pools; booth laser fan driven by mids/highs; blinder towers flashing on kicks
  - Crowd with raised arms and flickering phone lights; DJ head-bob on the beat
  - Fullscreen button + now-playing chip (cover, title, artist) that glows on song change
- **Alive stage rebuilt after the reference photo**: two giant rainbow-neon triangle lattices (magenta→purple left, green→orange right, per-triangle spectrum flicker, glowing outer edges), crossing red/green beams, magenta/green haze, pyramid with a bright animated LED screen on its face, scanline upper faces, robots with gold/silver visor glints, colorful crowd phone lights

**Phase 6.1 (v0.6.1) — Alive lighting overhaul**
- **Color eras**: like the real show, the scene rotates palettes with smooth hue crossfades every ~22s (or on big drops): cyan/white with pink strips (photo 1), inferno red-orange over a magenta wall (photo 2), full rainbow (photo 3), and violet
- **Inverted lattices** (wide at the top, tapering down) matching the reference geometry, denser (7 rows), per-triangle spectrum flicker, era-colored gradients, glowing outer frames
- **Volumetric beam fan** bursting from behind the pyramid — 14 sweeping shafts that jump on kicks, with white-hot cores in the cyan/violet eras
- **White blooms** flaring above the rig on the highs; **top LED strips**; faint **backwall lattice**; blazing **double-stroked pyramid edges** with a glinting **apex mirror**

**Phase 7 (v0.7) — StageDirector: the cinematic smart stage**
- **StageDirector** (`services/stageDirector.ts`): a central brain that draws nothing — it analyzes the AnalyserNode every frame (sub-bass, kick, snare, vocals, hi-hats by real Hz ranges, RMS, spectral flux) and publishes one reusable frame object; every visual element is dumb and only renders what the director says
- **Energy 0–100**: fast attack on impacts, slow release — heats brightness, particle counts, lasers, flashes and stage vibration
- **Frequency identities**: sub-bass → stage/camera vibration; kick → flash + expansion + head-bob; snare → quick strobes; vocals → center spotlight; hi-hats → sparkle/lasers/top-rig shimmer
- **Pre-impact**: strong kick onsets darken the stage ~80ms and THEN flash — the contrast makes hits feel physical
- **Physical inertia**: spring class (overshoot + damping) drives the spectrum bars, camera and fixture movement — the whole stage has mass
- **Cinematic camera**: subtle kick-vertical / bass-horizontal displacement and a very discreet drop zoom, all spring-smoothed, never uncomfortable
- **Afterglow**: flashes decay gradually (100→85→60→35→0), lights never cut instantly
- **Smart fixtures**: 10 moving heads pick coordinated targets (cross / converge / fan / sweep patterns), glide with springs and never blink randomly
- **Constant life**: breathing glow, slow sway and beam drift keep the stage alive even in silence
- **Mood palettes**: rock=warm, synthwave=purple/cyan, lo-fi=soft blues, jazz=amber, electronic=cyan/magenta — inferred from kick rate/energy/flux with 3s hysteresis and slow hue transitions
- **Spectacle moments**: drop detection (energy surge + flux spike) triggers ~6s of show mode — extra lasers, more particles, stronger flashes, micro zoom — then settles naturally
- **Performance**: zero per-frame allocations (preallocated buffers, particle pool, reused frame object), no React re-renders in the loop, spring/exp interpolation everywhere; `DirectorConfig` already exposes intensity/flash/motion/economy/cinematic knobs for future Settings

**Phase 8 (v0.8) — Show narrative: the philosophy change**
- **Show States**: the director now runs a narrative machine — `ambient → intro → build → drop → climax → break → finale` — driven by energy slope (8s window), tension accumulation, kick onsets and song progress. Each state completely reconfigures lasers, fixtures, wash, particles, camera and animation speed (`STATE_PARAMS`)
- **Emotion ≠ volume**: everything scales by a dramatic-intensity value (0..1) that follows the narrative, not the meter. Calm states are genuinely dark and calm — that's what makes the drop feel enormous
- **Selective impacts**: beats no longer fire effects automatically. The drop entrance is THE moment (pre-impact dim → explosion); inside the climax only rare, strong kicks earn an accent (3.2s cooldown); builds get only subtle ticks. Each break→drop return comes back slightly stronger (`dropBoost`)
- **Choreographed lasers**: 8 lasers perform figures with spring-eased transitions — converge on the DJ during builds (tension closing in), burst open as a fan on the drop, then cycle scissors-cross / wave / fan-pulse / pinwheel through the climax
- **Three independent light groups**: Wash (soft base color that survives calm states), Spotlights (warm narrow cones following the vocals/DJ, slot-cycling), Beams (sharp moving heads, state-gated)
- Discreet narrative readout (state name) in the canvas corner; Alive eras now switch on drop entries; particles/fan bursts only on selected impacts

**Phase 9 (v0.9) — Show Packs: a game of spectacles**
- **Six complete Show Packs**, one engine (same StageDirector frame, same impact events, same light groups — different worlds). Picker in the header; choice persists:
  - 🎧 **Festival Mainstage** — giant animated LED wall, six light groups, CO₂ jets on level-5 impacts, floor waves & ripples
  - 🔺 **Pyramid** — Daft Punk visual language with the Alive color eras (para o Arthur 🤖)
  - 🌌 **Cyber Arena** — perspective neon grid, holographic data columns, ring-stack hologram, neon pillars
  - 🌲 **Nature Pulse** — drifting aurora bands, luminous swaying trees, wandering fireflies
  - 🌃 **Synthwave City** — striped retro sun, neon skyline, scrolling perspective grid
  - 🚀 **Space Odyssey** — warp starfield (streaks on impact), nebulae, rotating station ring with lit windows
- **Impact Events (scale 1–5)**: not every beat fires. Level 1 = small motion; 2 = discreet flash; 3 = light punch; 4 = lasers surge; 5 = full synchronized spectacle (pre-impact dim → flash + bloom + camera punch + laser acceleration + bar amplitude + particle burst + CO₂), all on the SAME frame. Higher accumulated energy raises the odds of high-level hits
- **Combo System**: consecutive on-beat kicks build a combo; a 10+ streak forces a level-5 reward
- **14 professional laser figures**: fan, tunnel, cross, x, v, spiral, circle, cone, sweep, wave, crissCross, mirror, focusDJ, skyBeam — spring-eased transitions, accelerating after big impacts
- **Six light groups** with personality: Spotlights, Wash, Beams, Backlights, Floor Lights, Lasers
- **LED wall animation library** (14): equalizer, pixel rain, audio wave, pulse rings, matrix, cyber lines, spectrum mirror, triangles, noise, geometric pulse, glitch, tunnel, aurora, checker — crossfading, all synced
- Never a frozen frame: breathing, sway, drifting particles/fireflies/stars, floor waves persist even in silence. Zero per-frame allocations (pools in SceneState), no React re-renders in the loop

**Patch 0.9.1 — bug fixes**
- **Edit-mode animations** (spinning disc, drifting lyrics) no longer run wildly fast on some systems — the disc rotation is now driven by playback time instead of an independent CSS animation, so it's identical on every platform and can't run away.
- **Create/rename/delete playlist now works**: Electron disables `window.prompt()`/`confirm()` in packaged builds (they silently did nothing), so these now use proper in-app dialogs. The same fix applies to the "remove song from library" confirmation.
- **Synthwave City** no longer hammers the GPU: full-screen sky/sun/ground gradients are cached instead of rebuilt every frame, and the perspective grid avoids massive overdraw near the horizon.
- **Lyrics timing drift fixed**: removed fixed look-ahead offsets (a `+0.2s` in line detection and a `+0.65s` in Edit mode) that made lyrics feel slightly early on slow songs and late on fast ones. Lines now follow the song's real time.

**Patch 0.9.2 — volume fix + data safety**
- **Volume slider no longer freezes the app.** Dragging it was writing to the database on every single change event (dozens per second over IPC). The volume now applies to the audio instantly, while the *saved* value is debounced (~250ms after you stop). The same debounce was applied to the crossfade and EQ sliders, and the volume change now ramps smoothly to avoid clicks.
- **User data is stable across updates.** The library, stats, playlists, favorites and settings live in a SQLite database inside the OS user-data folder (`%APPDATA%/Harmony` on Windows, `~/.config/Harmony` on Linux) — *outside* the app, so reinstalling or updating never touches it. The schema only ever adds tables/columns (never drops), so updates preserve everything. The app name is now pinned so this folder is always `Harmony`.

**Phase 10 (v0.10.0) — Auto-update**
- The app now **updates itself** from the GitHub Releases it already publishes. On launch (and hourly) it checks for a newer version, downloads it quietly in the background, and shows a gentle prompt with a **"Restart to update"** button — the user chooses when. User data is always preserved.
- Works for the **Windows installer (NSIS)** and the **Linux AppImage**. The `.deb` and the Windows portable build can't self-update (a limitation of those formats), so those users update by downloading the new file — everything else updates automatically.

**Patch 0.10.1 — animation speed fix**
- Fixed the spinning sync arrow and the floating disc/lyrics running absurdly fast (a "everything is vibrating" look) on some displays. The Chromium compositor's CSS-animation clock can run fast on certain setups (e.g. high-refresh monitors), so all these motions are now driven from JavaScript on the real wall-clock (`requestAnimationFrame` + `performance.now()` for spinners; the song's own time for the disc/lyric float). They now always run at the correct, steady speed everywhere.

**Patch 0.10.2 — Linux AppImage launch fix**
- Fixed the AppImage aborting on modern Linux distros with `chrome-sandbox ... is not configured correctly` / `mode 4755`. Recent kernels (Ubuntu 23.10+, Debian 12+, etc.) restrict unprivileged user namespaces, so Chromium's SUID sandbox helper can't set itself up. Harmony now disables the setuid sandbox on Linux (standard for Electron apps like VS Code/Discord; it's a local music player with no untrusted web content), so the AppImage runs without any `sudo`/`chmod` steps.

**Phase 11 (v0.11.0) — Delight, part 1: premium interactions**
- **Premium seek bar**: hovering shows a floating time bubble at the cursor with a ghost fill; the thumb grows on hover; click or drag anywhere to scrub — all pointer-driven and fluid.
- **Scroll-to-adjust volume**: hovering the volume control and scrolling nudges it (up = louder), a small percentage bubble fades in while adjusting, and it never scrolls the page. Mute remembers your last level.
- **Micro-animations**: gentle content entrance (fade + rise), card lift on hover, pressable feedback, a breathing glow and shimmer utilities — subtle throughout, never loud.

**Phase 11.1 — Delight, part 2: smart library**
- **Spotify-style filter chips** with a sliding highlight that glides between filters: Todas, Adicionadas recentemente, Mais reproduzidas, Nunca reproduzidas, Última reprodução, Favoritas, plus a chip per genre in your library. Switching filters cross-fades the list.
- Backend now returns **play count** and **last-played** per song (joined from history), powering those filters efficiently.
- **Elegant cover placeholders**: songs without art get a soft two-tone gradient derived from the title (each keeps its own colors) with its initial — used across the song list and player, replacing the flat generic icon.

**Phase 11.2 — Delight, part 3: redesigned Equalizer**
- The equalizer is now a **full page** (not a cramped panel): a live **response-curve graph** that draws the EQ shape with the real-time spectrum behind it and a dashed **Flat reference** for comparison, **large vertical sliders** with instant feedback and a scaling thumb, modern presets, and a quick **Reset**. Settings links to it.

**Phase 11.3 — Delight, part 4: personal identity**
- Fixed the equalizer's vertical sliders (they rendered as tiny broken controls with `writing-mode: vertical`; now a horizontal range rotated upright, dragging works properly).
- **🎵 Meu Mundo Musical**: a personal panel with a custom photo + name (saved locally), favorite artist/album/genre, totals, hours listened and days using Harmony, plus your latest track.
- **Humanized stats**: warm sentences instead of bare numbers — "Você já passou mais de X dias inteiros ouvindo música", "Fulano está presente em Y% da sua biblioteca", etc.
- **Harmony Moments**: gentle milestone cards (first song, 100 songs, 100 hours, late-night listener, favorite playlist…) — reached ones glow, locked ones show how far you are. No invasive popups.
- **Harmony Journey**: a diary-style timeline of your musical history (when you started, your first song, your favorite artist, discoveries this month, hours listened, last played).
- New backend `stats:profile` computes all of this from the play history.

**Phase 11.4 — Delight, part 5: personalized playlists**
- Playlists can now have a **custom cover image**, **description**, and **emoji**. Picking an image extracts its **dominant color**, which tints the card and the playlist header for a cohesive look.
- Redesigned playlist cards (cover/emoji/color + description) and a rich detail header. New `playlists.updateMeta` backend and additive DB columns (image, description, emoji, color) keep existing playlists intact.

**Phase 11.5 — Delight, part 6: themes with personality + DJ Mode**
- Fixed the equalizer's sideways overflow: the rotated sliders now sit in fixed-width cells (absolutely positioned), so all 10 bands fit without horizontal scrolling.
- **Dynamic Themes**: four new themes with real personality on top of the existing set — **Synthwave** (neon glow, vibrant gradients, glowing headings), **Nature** (organic greens, soft rounded panels), **Glass** (heavy blur + transparency, elegant), and **Dark Pro** (deep black, high-contrast, minimal). Pixel now also uses a retro monospace font and crisp edges.
- **DJ Mode**: a fully immersive stage (button in the player bar, Esc to exit) that hides the app chrome and shows just the artwork, track and minimal controls — which fade away after a few seconds of no mouse movement. Ideal to leave running on a second screen.

**Phase 11.6 — Delight, part 7: artist photos + metadata + fixes**
- **Artist photos**: artists now show a real photo (fetched from Deezer, cached locally) with an elegant placeholder when none exists. Redesigned artist cards (circular photos) and a rich detail header.
- **✨ Atualizar Metadados** button (on the Artists page): fetches artist photos and any missing album/song covers online, with a live progress bar — and never overwrites data you already have.
- Fixes: volume scroll/click hitbox now aligns exactly with the bar (no more clicking above it); DJ Mode's broken minimize button removed (exit with F11 or Esc); the Visualizer stage-picker dropdown now sits above the canvas so you can actually pick a stage; and playlists gained sorting (custom drag order, recently added, oldest, duration, title).

**Phase 11.7 — Delight, part 8: multi-artist model + final polish**
- **Artists with feat./multiple names no longer duplicate.** Harmony now has a proper many-to-many artist model: an artist tag like "Skillet feat. Lacey Sturm" is split into individual artists ("Skillet", "Lacey Sturm"), each stored once. A song with multiple artists now shows up on *each* artist's page individually.
- A one-time, safe migration re-links your existing library to the new model and cleans up the old composite "A feat. B" entries — your songs, history and playlists are untouched.
- Splitting handles feat./ft./featuring, &, commas, x, vs. and parentheses. The main artist (first credited) drives the song's primary attribution.
- Long artist names now truncate cleanly instead of overlapping neighbouring cards, and a general consistency pass across spacing, empty states and truncation.

**Patch 0.11.8 — modal centering + empty-artist cleanup**
- Confirmation and editor modals now render through a **portal to `document.body`**, so they always center on screen. Previously, an ancestor with a CSS transform (the page fade-in animations) trapped the fixed overlay, making the delete-confirmation appear at the top of the page and forcing a scroll to reach it.
- Artists with **zero songs are now removed on startup** (and after deletions), clearing out the old composite "A feat. B" entries left behind by the multi-artist migration.

**Patch 0.11.9 — DJ Mode breathing animation fix**
- The DJ Mode cover's breathing (grow/shrink) animation could run absurdly fast on some Windows setups — the same high-refresh CSS-clock issue we fixed earlier for the spinning disc and lyrics. It's now driven from JavaScript on the real wall-clock (`requestAnimationFrame` + `performance.now()`), so it breathes at a correct, steady pace everywhere. The milestone emojis in "Meu Mundo Musical" use the same reliable timing.

**Phase 12 (v0.12.0) — "❤️ Apoie o Harmony" page**
- A new, heartfelt support page (in the sidebar) that fortifies the connection with the community rather than asking for money. Sections: a warm header, "how it started", a transparent "why support", support cards (PIX, Ko-fi, Buy Me a Coffee, GitHub Sponsors — each configurable, hidden until you add a link), a roadmap timeline, a thank-you note, and a supporters area.
- A gentle counter shows **the user's own** hours listened and library size (real data), so it feels personal — "the Harmony is growing with its community".
- Support is always optional; nothing pressures the user. External links open safely in the system browser (http/https only).
- Currently enabled: **Ko-fi** (ko-fi.com/isaacghostlolp). Other channels (PIX, Buy Me a Coffee, GitHub Sponsors) stay hidden until a link is added in `SUPPORT_LINKS` / `PIX_KEY` at the top of `src/renderer/src/pages/Support.tsx`.
- The sidebar navigation now scrolls when the window is short, and **Apoie o Harmony** is pinned to the bottom so it's always reachable.

**Patch 0.12.1 — first supporter + online genres**
- 🎉 Added the Harmony's **first official supporter, CP-405**, to the support page — with a golden crown, glowing ring and a "1º apoiador" badge. Thank you, CP-405!
- **Genres are now fetched online**: "✨ Atualizar Metadados" now also fills in each song's genre via the iTunes catalog when the file's tag is empty or the useless "Music" catch-all — so "top genre" and the genre filters become meaningful. Stats ignore the generic "Music" value.

**Phase 13 (v0.13.0) — Worlds: the theme engine + Black Hole**
- New **Theme Director** engine and **World SDK**: themes can now be living, immersive *worlds* rendered on a full-screen canvas behind a glassy UI, reacting to the music. A World is a small module (`mount`/`frame`/`unmount`) that receives a live context — spectrum, kick, bass, energy, impact, progress, accent, cover, day phase — the exact same contract a community developer would implement. Worlds lazy-load (only the active world's code runs) and share one rAF loop with particle pooling.
- First world: **🕳️ Black Hole** (Signature) — a living cosmos with a rotating accretion disc (speeds up with bass), gravitational lensing bending nearby stars, an event horizon that pulses on the kick, slowly orbiting stars, cosmic dust pulled inward, and occasional meteors. Inspired by Interstellar.
- Pick a world under Settings → "Em qual mundo você quer ouvir hoje?". Classic themes (Dark, Light, AMOLED, …) stay weightless and turn the world off. More worlds — and community-made ones — are on the way.

**Patch 0.13.1 — world transparency fix + 🌧️ Rain world**
- Fixed Worlds not being visible: the world canvas sat at a negative z-index behind the app's background, so it was hidden. It now renders at z-0 with the UI lifted above it, and the app chrome (sidebar, main, player) goes properly glassy so the living world shows through.
- New world: **🌧️ Rain** — a cozy window onto a rainy night city. Rain streaks down with wind slant, drops cling and slide on the "glass", amber city-lights twinkle, and lightning flashes occasionally (and on big musical impacts). Rain density rises with the music's energy. Made for lo-fi.

**Patch 0.13.2 — world transparency (real fix) + 🌲 Nature world**
- **Worlds are now actually visible.** The real culprit was the dynamic blurred-cover background sitting on the same layer as the world canvas and covering it — it's now disabled whenever a world is active, and the `world-active` class is applied reactively so the glassy chrome always kicks in. The living world shows through the panels as intended.
- New world: **🌲 Nature** — a calm forest that shifts with the time of day (dawn/day/dusk/night palettes). Sun rays filter through swaying trees, leaves drift on the wind, fireflies glow at dusk and night (more with the music's energy), and a soft mist hugs the ground.

**Patch 0.13.3 — worlds render fix (the real one) + 🌃 Cyberpunk world**
- **Found the true cause worlds weren't visible.** A full audit traced it to the ThemeDirector's render loop, not the CSS: React re-mounting the canvas host (StrictMode / hot-reload) ran attach → detach → attach, and because detach cleared the active world, the setWorld() guard then skipped restarting the loop — leaving a blank, stopped canvas. Now attach resumes the loop when a world is already selected, and detach preserves it. Verified with a unit test of the mount sequence. The living world now shows through the glassy UI as intended.
- New world: **🌃 Cyberpunk** — a living neon city at night: parallax buildings with flickering neon windows, holographic billboards, thin rain through the glow, wet accent reflections, CRT scanlines, and glitch tears that fire on musical impacts. Inspired by Cyberpunk 2077.

**Patch 0.13.4 — worlds now clearly visible through the panels**
- The world render loop fix (0.13.3) got worlds drawing again, but a heavy 26px backdrop-blur on the panels flattened the world behind them into a near-uniform haze — visible at the window edges but muddy under the UI. Panels in world mode now use a light blur (6–8px) and much lower opacity (18–28%), so the living world reads clearly through the sidebar, library and player. A soft text-shadow keeps everything readable over the busier backgrounds.

**Phase 14 (v0.14.0) — customizable worlds + your own background**
- **Tune any world to taste.** With a world active, Settings now shows sliders for panel **transparency** and **blur**, applied live via CSS variables and remembered between sessions. Everyone can dial in exactly how much of the world shows through the UI.
- **Bring your own background (🖼️ Meu fundo).** A new world lets non-developers import their own **image (PNG/JPG)** or **video (MP4/WebM)** as a living background. Images get a gentle, music-reactive Ken-Burns drift/zoom and a beat bloom; videos play behind the glassy UI via a real `<video>` element. (Heads-up in the UI: very heavy videos can slow the app.)
- This complements the developer-facing World SDK: creators can code worlds, and everyone else can drop in a photo or clip — both flow through the same Theme Director.

**Phase 15 (v0.15.0) — the full world collection**
- Added the final seven immersive worlds, completing the collection (12 in total). Each is its own lazy-loaded module reacting to the music through the Theme Director:
  - **🌊 Ocean** — underwater sun rays, schooling fish, rising bubbles, coral and plankton.
  - **❄️ Winter** — a snowy night with a waving aurora borealis and drifting flakes.
  - **☕ Coffee Shop** — cozy amber bokeh, rain on the window, and steam curling off a coffee cup.
  - **⛩️ Japanese Garden** — a dusk zen garden with cherry-blossom petals, stone lanterns, a rippling pond and a torii gate.
  - **🌆 Synthwave** — an '80s neon sun, wireframe mountains and an endless perspective grid.
  - **🛰️ Space Station** — a panoramic window over a turning planet, with satellites, nebulae and meteors.
  - **🌋 Volcano** — a volcanic night lit by molten lava, rising embers and falling ash.
- Worlds are organized into Clássicos / Worlds / Signature categories, each still fully tunable (transparency & blur) and usable alongside your own imported background.

**Library workflow additions (part of this release)**
- **Multi-select, Spotify-style.** Hover a row and a checkbox appears where the "⋯" used to be; click it (or the row) to select, Shift-click to select a range from the anchor, Ctrl/Cmd-click to toggle, Ctrl/Cmd+A to select all, and Esc to clear. A selection bar lets you play, add many songs to a playlist at once, bulk-sync covers/lyrics, or bulk-remove.
- **Genre chips scroll with the mouse wheel** (a vertical wheel scrolls them sideways) without scrolling the page underneath.
- **The "⋯" menu opens upward** when a row is near the bottom of the screen, so it never clips off-screen.

**Patch 0.15.1 — custom wallpaper now persists**
- Fixed the imported "Meu fundo" wallpaper being lost on restart/reload. It was held only as a session-only object URL; now the chosen image/video is copied into the app's data folder and served from a stable path, so it's remembered across restarts. Removing it clears the saved file too.

## Discord Rich Presence setup

1. Go to https://discord.com/developers/applications → **New Application** (name it "Harmony")
2. Copy the **Application ID**
3. In Harmony: Settings → Discord Rich Presence → paste the ID and flip the toggle
4. (Optional) In the Discord app settings, upload an art asset named `harmony` for the large icon

## Roadmap (v0.3+)

| Feature | Where to plug in |
|---|---|
| Edit mode as exportable video | Render the EditView to canvas frames (`OffscreenCanvas`) + `MediaRecorder` |
| More lyric providers | Add a provider fn in `services/online.ts`; the scorer/filter pipeline is shared |
| Audio visualizer | `AnalyserNode` tapped after the EQ chain in `audioEngine.ts` |
| Online radios | New `Song`-like source with a stream URL; the engine already streams |
| Metadata APIs (MusicBrainz etc.) | Enrich `scanner.ts` results in main |
| Device sync | Export/import the SQLite db + a sync service |
| Plugins | Preload-exposed plugin host with a manifest folder |


## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and run `npm run typecheck && npm run build` before opening a PR.

## 📄 License

[MIT](./LICENSE) © Isaac (Aisaac)
