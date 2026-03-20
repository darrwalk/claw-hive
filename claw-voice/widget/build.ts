import { build } from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

await build({
  entryPoints: [join(__dirname, 'claw-voice.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: join(__dirname, '..', 'dist', 'claw-voice.js'),
  define: { __VERSION__: JSON.stringify(pkg.version) },
})

console.log('[build] Widget built → dist/claw-voice.js')
