/**
 * The desktop's part of the online lookups (src/core/online.ts has the
 * providers, matching and channels): downloaded images are saved in
 * userData/covers, named after a hash of what they show.
 */
import { createHash } from 'crypto'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { coversDir } from '../db/database'
import type { SaveImage } from '../../core/online'

export { EFFECTIVE_COVER_SQL } from '../../core/library'

export const saveImage: SaveImage = async (data, ext, key) => {
  const hash = createHash('md5').update(key).digest('hex')
  const file = join(coversDir(), `online-${hash}.${ext}`)
  if (!existsSync(file)) writeFileSync(file, data)
  return file
}
