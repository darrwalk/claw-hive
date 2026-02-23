import { build } from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [join(__dirname, 'claw-voice.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: join(__dirname, '..', 'dist', 'claw-voice.js'),
})

console.log('[build] Widget built → dist/claw-voice.js')
