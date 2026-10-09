/**
 * The sticker sheet. Every sticker is a small hand-drawn SVG on a 100×100
 * board (kept inside ~10..90 so the die-cut border fits); the white border
 * and the drop shadow come from one shared filter (#stk-cut, in
 * StickerDefs), so the art here is only the flat drawing.
 *
 * `anim` names how a sticker moves: a CSS animation (spin, float, twinkle,
 * wobble, flicker, eq, holo) or 'beat', which pulses with the kick of the
 * song that is playing.
 */

export type StickerAnim = 'none' | 'spin' | 'float' | 'twinkle' | 'wobble' | 'flicker' | 'beat' | 'eq' | 'holo'

export interface StickerDef {
  id: string
  name: string
  anim: StickerAnim
  art: JSX.Element
}

const INK = '#1d1b26'

export const STICKERS: StickerDef[] = [
  {
    id: 'heart',
    name: 'Coração',
    anim: 'beat',
    art: (
      <>
        <path d="M50 84C22 66 10 49 13 34 16 19 37 13 50 29 63 13 84 19 87 34 90 49 78 66 50 84Z" fill="#ff4d6d" />
        <path d="M27 30c4-6 11-7 15-3" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".7" />
      </>
    )
  },
  {
    id: 'notes',
    name: 'Notas',
    anim: 'wobble',
    art: (
      <>
        <path d="M36 70V28l40-10v42" stroke="#7c5cff" strokeWidth="7" strokeLinejoin="round" fill="none" />
        <path d="M36 28l40-10v11l-40 10z" fill="#7c5cff" />
        <ellipse cx="27" cy="71" rx="12" ry="9" transform="rotate(-20 27 71)" fill="#7c5cff" />
        <ellipse cx="67" cy="61" rx="12" ry="9" transform="rotate(-20 67 61)" fill="#7c5cff" />
        <ellipse cx="23" cy="68" rx="3.5" ry="2" transform="rotate(-20 23 68)" fill="#fff" opacity=".6" />
      </>
    )
  },
  {
    id: 'vinyl',
    name: 'Vinil',
    anim: 'spin',
    art: (
      <>
        <circle cx="50" cy="50" r="40" fill="#141318" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#2c2a33" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="#2c2a33" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="21" fill="none" stroke="#2c2a33" strokeWidth="1.5" />
        <path d="M24 30a34 34 0 0 1 18-12" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".35" />
        <circle cx="50" cy="50" r="14" fill="#ff9f1c" />
        <circle cx="50" cy="50" r="9" fill="none" stroke="#ffd166" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="2.6" fill="#fff" />
      </>
    )
  },
  {
    id: 'cd',
    name: 'CD',
    anim: 'spin',
    art: (
      <>
        <circle cx="50" cy="50" r="40" fill="url(#stk-cd)" />
        <path d="M50 10a40 40 0 0 1 28 12L50 50z" fill="#fff" opacity=".45" />
        <path d="M50 90a40 40 0 0 1-28-12L50 50z" fill="#fff" opacity=".35" />
        <circle cx="50" cy="50" r="12" fill="#e8e8f0" stroke="#b8b8c8" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="5" fill="#fff" />
      </>
    )
  },
  {
    id: 'cassette',
    name: 'Fita',
    anim: 'none',
    art: (
      <>
        <rect x="10" y="24" width="80" height="54" rx="7" fill="#ffb703" />
        <rect x="18" y="31" width="64" height="26" rx="4" fill="#fff8e7" />
        <rect x="18" y="31" width="64" height="7" rx="3" fill="#fb5607" />
        <circle cx="35" cy="47" r="6" fill={INK} />
        <circle cx="65" cy="47" r="6" fill={INK} />
        <rect x="42" y="44" width="16" height="6" rx="2" fill="#3a3540" />
        <path d="M28 78l5-12h34l5 12" fill="#e09a00" />
        <circle cx="38" cy="72" r="2" fill={INK} />
        <circle cx="62" cy="72" r="2" fill={INK} />
      </>
    )
  },
  {
    id: 'headphones',
    name: 'Fones',
    anim: 'beat',
    art: (
      <>
        <path d="M20 60V48a30 30 0 0 1 60 0v12" stroke="#2b2d42" strokeWidth="8" strokeLinecap="round" fill="none" />
        <rect x="12" y="52" width="20" height="30" rx="9" fill="#ef476f" />
        <rect x="68" y="52" width="20" height="30" rx="9" fill="#ef476f" />
        <rect x="16" y="57" width="5" height="16" rx="2.5" fill="#fff" opacity=".5" />
      </>
    )
  },
  {
    id: 'speaker',
    name: 'Caixa de som',
    anim: 'beat',
    art: (
      <>
        <rect x="20" y="12" width="60" height="78" rx="9" fill="#2b2d42" />
        <circle cx="50" cy="31" r="10" fill="#8d99ae" />
        <circle cx="50" cy="31" r="4" fill="#2b2d42" />
        <circle cx="50" cy="64" r="19" fill="#8d99ae" />
        <circle cx="50" cy="64" r="12" fill="#4a4e69" />
        <circle cx="50" cy="64" r="5" fill="#06d6a0" />
      </>
    )
  },
  {
    id: 'eq',
    name: 'Equalizador',
    anim: 'eq',
    art: (
      <>
        <rect x="12" y="12" width="76" height="76" rx="14" fill="#1b1e3c" />
        <rect className="stk-bar stk-bar-1" x="22" y="30" width="12" height="48" rx="4" fill="#06d6a0" />
        <rect className="stk-bar stk-bar-2" x="38" y="22" width="12" height="56" rx="4" fill="#ffd166" />
        <rect className="stk-bar stk-bar-3" x="54" y="36" width="12" height="42" rx="4" fill="#ef476f" />
        <rect className="stk-bar stk-bar-4" x="70" y="46" width="8" height="32" rx="4" fill="#118ab2" />
      </>
    )
  },
  {
    id: 'mic',
    name: 'Microfone',
    anim: 'wobble',
    art: (
      <>
        <rect x="44" y="50" width="12" height="38" rx="5" fill="#2b2d42" />
        <circle cx="50" cy="32" r="21" fill="#c0c7d6" />
        <path d="M33 26h34M31 34h38M34 42h32" stroke="#8d99ae" strokeWidth="2.5" />
        <rect x="40" y="52" width="20" height="7" rx="3" fill="#ffd166" />
        <circle cx="42" cy="22" r="4" fill="#fff" opacity=".7" />
      </>
    )
  },
  {
    id: 'star',
    name: 'Estrela',
    anim: 'twinkle',
    art: (
      <>
        <path d="M50 10l11 25 27 3-20 18 6 27-24-14-24 14 6-27-20-18 27-3z" fill="#ffd60a" strokeLinejoin="round" stroke="#ffd60a" strokeWidth="4" />
        <path d="M44 32l6-13" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
      </>
    )
  },
  {
    id: 'holo',
    name: 'Estrela holográfica',
    anim: 'holo',
    art: (
      <>
        <path d="M50 8c4 24 18 38 42 42-24 4-38 18-42 42-4-24-18-38-42-42 24-4 38-18 42-42z" fill="url(#stk-holo)" />
        <path d="M50 26c2 12 9 20 22 24" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".7" />
      </>
    )
  },
  {
    id: 'sparkle',
    name: 'Brilhos',
    anim: 'twinkle',
    art: (
      <>
        <path d="M40 14c3 17 10 25 26 28-16 3-23 11-26 28-3-17-10-25-26-28 16-3 23-11 26-28z" fill="#4cc9f0" />
        <path d="M72 50c2 10 6 14 16 16-10 2-14 6-16 16-2-10-6-14-16-16 10-2 14-6 16-16z" fill="#f72585" />
        <circle cx="72" cy="24" r="5" fill="#ffd60a" />
      </>
    )
  },
  {
    id: 'bolt',
    name: 'Raio',
    anim: 'flicker',
    art: <path d="M58 8L22 56h22l-8 36 40-52H52z" fill="#ffd60a" stroke="#f4a100" strokeWidth="3" strokeLinejoin="round" />
  },
  {
    id: 'flame',
    name: 'Fogo',
    anim: 'flicker',
    art: (
      <>
        <path d="M50 90c-20 0-32-14-30-31 2-15 14-22 14-38 12 8 16 18 15 26 6-4 9-11 9-18 13 10 22 25 22 37 0 14-12 24-30 24z" fill="#ff6b00" />
        <path d="M50 88c-10 0-16-7-15-16 1-8 8-12 9-20 7 5 9 10 9 14 4-2 6-6 6-10 6 6 9 11 9 17 0 9-8 15-18 15z" fill="#ffd000" />
      </>
    )
  },
  {
    id: 'sun',
    name: 'Sol',
    anim: 'spin',
    art: (
      <>
        <g fill="#ffb703">
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d="M50 8l6 14H44z" transform={`rotate(${i * 36} 50 50)`} />
          ))}
        </g>
        <circle cx="50" cy="50" r="24" fill="#ffd60a" />
        <circle cx="42" cy="47" r="3" fill={INK} />
        <circle cx="58" cy="47" r="3" fill={INK} />
        <path d="M42 57q8 7 16 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      </>
    )
  },
  {
    id: 'moon',
    name: 'Lua',
    anim: 'float',
    art: (
      <>
        <path d="M62 12a38 38 0 1 0 26 52A30 30 0 0 1 62 12z" fill="#ffe8a3" />
        <circle cx="40" cy="62" r="5" fill="#f2d27a" />
        <circle cx="30" cy="44" r="3.5" fill="#f2d27a" />
        <circle cx="52" cy="78" r="3" fill="#f2d27a" />
        <path d="M74 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" />
      </>
    )
  },
  {
    id: 'cloud',
    name: 'Nuvem',
    anim: 'float',
    art: (
      <>
        <path d="M26 74a16 16 0 0 1-2-32 22 22 0 0 1 42-6 18 18 0 0 1 12 38z" fill="#dff3ff" />
        <circle cx="40" cy="58" r="3" fill={INK} />
        <circle cx="60" cy="58" r="3" fill={INK} />
        <ellipse cx="34" cy="65" rx="4" ry="2.5" fill="#ff8fab" />
        <ellipse cx="66" cy="65" rx="4" ry="2.5" fill="#ff8fab" />
        <path d="M46 64q4 4 8 0" stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </>
    )
  },
  {
    id: 'rainbow',
    name: 'Arco-íris',
    anim: 'none',
    art: (
      <>
        <path d="M12 72a38 38 0 0 1 76 0" stroke="#ff595e" strokeWidth="8" fill="none" />
        <path d="M20 72a30 30 0 0 1 60 0" stroke="#ffca3a" strokeWidth="8" fill="none" />
        <path d="M28 72a22 22 0 0 1 44 0" stroke="#8ac926" strokeWidth="8" fill="none" />
        <path d="M36 72a14 14 0 0 1 28 0" stroke="#1982c4" strokeWidth="8" fill="none" />
        <ellipse cx="18" cy="76" rx="12" ry="8" fill="#fff" />
        <ellipse cx="82" cy="76" rx="12" ry="8" fill="#fff" />
      </>
    )
  },
  {
    id: 'planet',
    name: 'Planeta',
    anim: 'float',
    art: (
      <>
        <circle cx="50" cy="50" r="24" fill="#9b5de5" />
        <path d="M30 42q20 6 40-2M28 54q22 7 44-1" stroke="#c77dff" strokeWidth="4" fill="none" />
        <ellipse cx="50" cy="52" rx="42" ry="11" transform="rotate(-16 50 52)" fill="none" stroke="#f15bb5" strokeWidth="5" />
        <path d="M27 40a24 24 0 0 1 46 0" fill="#9b5de5" />
        <path d="M30 42q20 6 40-2" stroke="#c77dff" strokeWidth="4" fill="none" />
      </>
    )
  },
  {
    id: 'alien',
    name: 'Alien',
    anim: 'wobble',
    art: (
      <>
        <path d="M30 18l8 12M70 18l-8 12" stroke="#5be36d" strokeWidth="4" strokeLinecap="round" />
        <circle cx="29" cy="16" r="5" fill="#5be36d" />
        <circle cx="71" cy="16" r="5" fill="#5be36d" />
        <path d="M50 26c22 0 34 14 32 30-2 18-18 32-32 32S20 74 18 56c-2-16 10-30 32-30z" fill="#5be36d" />
        <ellipse cx="37" cy="54" rx="9" ry="12" transform="rotate(20 37 54)" fill={INK} />
        <ellipse cx="63" cy="54" rx="9" ry="12" transform="rotate(-20 63 54)" fill={INK} />
        <circle cx="35" cy="50" r="3" fill="#fff" />
        <circle cx="61" cy="50" r="3" fill="#fff" />
        <path d="M44 76q6 4 12 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      </>
    )
  },
  {
    id: 'ghost',
    name: 'Fantasminha',
    anim: 'float',
    art: (
      <>
        <path d="M22 86V46a28 28 0 0 1 56 0v40l-9-7-9 7-10-7-10 7-9-7z" fill="#efeaff" stroke="#c9c0f2" strokeWidth="2.5" strokeLinejoin="round" />
        <ellipse cx="40" cy="46" rx="5" ry="7" fill={INK} />
        <ellipse cx="60" cy="46" rx="5" ry="7" fill={INK} />
        <ellipse cx="50" cy="62" rx="5" ry="6" fill={INK} />
        <ellipse cx="32" cy="56" rx="4" ry="2.5" fill="#ffafcc" />
        <ellipse cx="68" cy="56" rx="4" ry="2.5" fill="#ffafcc" />
      </>
    )
  },
  {
    id: 'cat',
    name: 'Gatinho',
    anim: 'none',
    art: (
      <>
        <path d="M18 40L20 12l22 16h16l22-16 2 28c6 8 8 16 6 24-4 18-22 26-38 26S16 82 12 64c-2-8 0-16 6-24z" fill="#3d3a4b" />
        <path d="M24 22l2 12 9-6zM76 22l-2 12-9-6z" fill="#ff8fab" />
        <ellipse cx="37" cy="54" rx="6" ry="7" fill="#ffd166" />
        <ellipse cx="63" cy="54" rx="6" ry="7" fill="#ffd166" />
        <ellipse cx="37" cy="54" rx="2" ry="6" fill={INK} />
        <ellipse cx="63" cy="54" rx="2" ry="6" fill={INK} />
        <path d="M46 66h8l-4 4z" fill="#ff8fab" />
        <path d="M50 70q-4 6-9 3M50 70q4 6 9 3" stroke="#bdb8cc" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M30 68l-16-2M30 72l-15 4M70 68l16-2M70 72l15 4" stroke="#bdb8cc" strokeWidth="1.8" strokeLinecap="round" />
      </>
    )
  },
  {
    id: 'smiley',
    name: 'Sorriso',
    anim: 'beat',
    art: (
      <>
        <circle cx="50" cy="50" r="38" fill="#ffd60a" />
        <ellipse cx="38" cy="42" rx="4.5" ry="7" fill={INK} />
        <ellipse cx="62" cy="42" rx="4.5" ry="7" fill={INK} />
        <path d="M30 56q20 22 40 0" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M22 36a30 30 0 0 1 14-14" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".6" />
      </>
    )
  },
  {
    id: 'cherry',
    name: 'Cerejas',
    anim: 'none',
    art: (
      <>
        <path d="M34 66C38 44 50 28 66 16M66 66C64 46 66 30 66 16" stroke="#3a7d44" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M66 16c8-8 18-6 22 0-8 6-16 6-22 0z" fill="#70e000" />
        <circle cx="32" cy="70" r="16" fill="#e5383b" />
        <circle cx="66" cy="70" r="16" fill="#d00000" />
        <ellipse cx="26" cy="64" rx="4" ry="3" fill="#fff" opacity=".7" />
        <ellipse cx="60" cy="64" rx="4" ry="3" fill="#fff" opacity=".6" />
      </>
    )
  },
  {
    id: 'mushroom',
    name: 'Cogumelo',
    anim: 'none',
    art: (
      <>
        <path d="M38 56h24l4 28a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6z" fill="#fff1e6" />
        <path d="M12 56c0-24 18-40 38-40s38 16 38 40z" fill="#e63946" />
        <circle cx="34" cy="36" r="7" fill="#fff" />
        <circle cx="62" cy="30" r="5" fill="#fff" />
        <circle cx="72" cy="46" r="5" fill="#fff" />
        <circle cx="48" cy="48" r="4" fill="#fff" />
        <circle cx="45" cy="70" r="2.5" fill={INK} />
        <circle cx="55" cy="70" r="2.5" fill={INK} />
      </>
    )
  },
  {
    id: 'cactus',
    name: 'Cacto',
    anim: 'wobble',
    art: (
      <>
        <path d="M30 70h40l-4 20H34z" fill="#e07a5f" />
        <rect x="26" y="66" width="48" height="8" rx="3" fill="#c8553d" />
        <rect x="40" y="16" width="20" height="54" rx="10" fill="#52b788" />
        <path d="M40 50H30a8 8 0 0 1-8-8V32" stroke="#52b788" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M60 42h8a8 8 0 0 0 8-8v-6" stroke="#52b788" strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="50" cy="16" r="5" fill="#ff8fab" />
        <circle cx="46" cy="38" r="2" fill={INK} />
        <circle cx="54" cy="38" r="2" fill={INK} />
        <path d="M47 44q3 3 6 0" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </>
    )
  },
  {
    id: 'crown',
    name: 'Coroa',
    anim: 'twinkle',
    art: (
      <>
        <path d="M14 34l18 16 18-28 18 28 18-16-8 44H22z" fill="#ffc300" strokeLinejoin="round" stroke="#ffc300" strokeWidth="3" />
        <rect x="22" y="70" width="56" height="10" rx="3" fill="#e5a000" />
        <circle cx="50" cy="56" r="5" fill="#ef476f" />
        <circle cx="33" cy="60" r="3.5" fill="#118ab2" />
        <circle cx="67" cy="60" r="3.5" fill="#06d6a0" />
      </>
    )
  },
  {
    id: 'pizza',
    name: 'Pizza',
    anim: 'none',
    art: (
      <>
        <path d="M14 22q36-14 72 0L50 90z" fill="#ffd166" />
        <path d="M14 22q36-14 72 0l-3 7q-33-12-66 0z" fill="#d4a373" />
        <circle cx="40" cy="36" r="6" fill="#e63946" />
        <circle cx="60" cy="40" r="6" fill="#e63946" />
        <circle cx="50" cy="60" r="5" fill="#e63946" />
        <circle cx="52" cy="30" r="2" fill="#2d6a4f" />
        <circle cx="44" cy="50" r="2" fill="#2d6a4f" />
      </>
    )
  },
  {
    id: 'play',
    name: 'Play',
    anim: 'beat',
    art: (
      <>
        <circle cx="50" cy="50" r="38" fill="#ff006e" />
        <path d="M41 32v36l30-18z" fill="#fff" strokeLinejoin="round" stroke="#fff" strokeWidth="4" />
      </>
    )
  },
  {
    id: 'badge-lofi',
    name: 'Lo-fi',
    anim: 'wobble',
    art: (
      <>
        <rect x="8" y="30" width="84" height="40" rx="20" fill="#cdb4db" />
        <text x="50" y="58" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="24" fill="#3d2c4f">
          LO-FI
        </text>
      </>
    )
  },
  {
    id: 'badge-vibe',
    name: 'Good vibes',
    anim: 'none',
    art: (
      <>
        <rect x="8" y="26" width="84" height="48" rx="10" fill={INK} transform="rotate(-6 50 50)" />
        <g transform="rotate(-6 50 50)" fontFamily="system-ui, sans-serif" fontWeight="900" textAnchor="middle">
          <text x="50" y="47" fontSize="15" fill="#ffd60a">
            GOOD
          </text>
          <text x="50" y="64" fontSize="15" fill="#4cc9f0">
            VIBES
          </text>
        </g>
      </>
    )
  },
  {
    id: 'badge-harmony',
    name: 'Harmony',
    anim: 'holo',
    art: (
      <>
        <rect x="6" y="32" width="88" height="36" rx="18" fill="url(#stk-holo)" />
        <text x="50" y="56" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="17" fill="#2a1f3d">
          HARMONY
        </text>
      </>
    )
  }
]

const byId = new Map(STICKERS.map((s) => [s.id, s]))
export const findSticker = (id: string): StickerDef | undefined => byId.get(id)
