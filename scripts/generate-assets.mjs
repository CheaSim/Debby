import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'build/finpet-icon.svg')
mkdirSync(resolve(root, 'build'), { recursive: true })

const svg = await readFile(source)
await sharp(svg).resize(512, 512).png().toFile(resolve(root, 'build/icon.png'))
await sharp(svg).resize(32, 32).png().toFile(resolve(root, 'build/tray.png'))

const iconPngs = await Promise.all([16, 24, 32, 48, 64, 128, 256].map((size) =>
  sharp(svg).resize(size, size).png().toBuffer()
))
await writeFile(resolve(root, 'build/icon.ico'), await pngToIco(iconPngs))

console.log('Generated FinPet application assets.')
