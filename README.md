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
