import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'astrorepo',
  },
  makers: [
    new MakerSquirrel({ name: 'astrorepo' }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
}

export default config
