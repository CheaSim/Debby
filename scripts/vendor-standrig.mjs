import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(process.argv[2] ?? resolve(root, 'work/upstream-standrig'))
const commit = 'd639ea5b123c37c1c3b7981b01b2cf64d3bd9e91'
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw Error('Use the reviewed StandRig revision: ' + commit)
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source, encoding: 'utf8' }).trim()) throw Error('StandRig sources must be unmodified.')
const target = resolve(root, 'src/renderer/src/avatar/vendor/standrig')
const notices = resolve(root, 'src/renderer/public/vendor/standrig')
mkdirSync(target, { recursive: true })
mkdirSync(notices, { recursive: true })
const result = await build({
  entryPoints: [resolve(root, 'integrations/standrig-browser.entry.ts')],
  outfile: resolve(target, 'standrig.js'), bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', minify: true, metafile: true, legalComments: 'inline',
  banner: { js: '/*! StandRig 0.2.0, Apache-2.0. See LICENSE, NOTICE.md and provenance.json. */' },
  plugins: [{ name: 'pinned-standrig-sources', setup(api) {
    api.onResolve({ filter: /^@standrig\/(core|runtime)\// }, args => {
      const [, pkg, entry] = args.path.match(/^@standrig\/(core|runtime)\/(.+)$/)
      return { path: resolve(source, `packages/${pkg}/src/${entry}.ts`) }
    })
  } }]
})
const hashes = Object.fromEntries(Object.keys(result.metafile.inputs).sort().map(file => {
  const path = resolve(file)
  if (!path.startsWith(source + '\\') && !path.startsWith(source + '/') && path !== resolve(root, 'integrations/standrig-browser.entry.ts')) throw Error('Unexpected bundled dependency: ' + path)
  const label = path.startsWith(source) ? path.slice(source.length + 1).replaceAll('\\', '/') : 'integrations/standrig-browser.entry.ts'
  return [label, createHash('sha256').update(readFileSync(path)).digest('hex')]
}))
writeFileSync(resolve(target, 'LICENSE'), readFileSync(resolve(source, 'LICENSE')))
writeFileSync(resolve(target, 'UPSTREAM-NOTICE'), readFileSync(resolve(source, 'NOTICE')))
for (const name of ['LICENSE', 'NOTICE.md', 'UPSTREAM-NOTICE']) writeFileSync(resolve(notices, name), readFileSync(resolve(target, name)))
writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ repository: 'https://github.com/sayaka-aiart/StandRig', commit, license: 'Apache-2.0', sources: hashes, modifications: 'Unmodified upstream TypeScript bundled with esbuild; Debby supplies the export-only entry. No upstream artwork, editor, device or service modules.' }, null, 2) + '\n')
console.log('Vendored pinned StandRig browser runtime and validation.')
