import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'astrorepo',
    // The packager adds .ico on Windows and .png elsewhere (scripts/app-icon.ts writes both).
    icon: 'resources/icon',
  },
  makers: [
    new MakerSquirrel({ name: 'astrorepo', setupIcon: 'resources/icon.ico' }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
}

export default config
