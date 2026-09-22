/**
 * Generates 57 placeholder Among Us style symbols so the game is fully
 * playable before the real artwork arrives.
 *
 *   npm run gen:symbols
 *
 * 19 crewmate colours x 3 accessories = 57 visually distinct symbols.
 *
 * REPLACE THESE: drop your own 57 images into src/assets/symbols/ and delete
 * the placeholder-*.svg files. Nothing else needs to change — src/game/symbols.js
 * picks up whatever is in that folder, in natural filename order.
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../src/assets/symbols')

const COLORS = [
  ['red', '#C51111', '#7A0838'],
  ['blue', '#132ED1', '#09158E'],
  ['green', '#117F2D', '#0A4D2E'],
  ['pink', '#ED54BA', '#AB2BAD'],
  ['orange', '#EF7D0D', '#B33E15'],
  ['yellow', '#F5F557', '#C38823'],
  ['black', '#3F474E', '#1E1F26'],
  ['white', '#D6E0F0', '#8394BF'],
  ['purple', '#6B2FBB', '#3B177C'],
  ['brown', '#71491E', '#5E2615'],
  ['cyan', '#38FEDB', '#24A8BE'],
  ['lime', '#50EF39', '#15A742'],
  ['maroon', '#6C2B3D', '#4A1B29'],
  ['rose', '#FFD6EC', '#E0A0C4'],
  ['banana', '#FFFFBE', '#C2C293'],
  ['gray', '#8397A7', '#5A6B7B'],
  ['tan', '#9F9989', '#6F6A5E'],
  ['coral', '#EC7578', '#B14E51'],
  ['teal', '#1D7D74', '#0F4A45'],
]

const ACCESSORIES = ['plain', 'cap', 'antenna']

const BODY =
  'M34 46 C34 24 48 12 67 12 C86 12 100 24 100 46 L100 104 ' +
  'C100 114 94 120 85 120 L74 120 L74 102 C74 96 70 92 64 92 ' +
  'C58 92 54 96 54 102 L54 120 L45 120 C37 120 34 114 34 104 Z'

const VISOR =
  'M58 30 L90 30 C99 30 105 38 105 48 C105 58 99 66 90 66 ' +
  'L58 66 C50 66 46 59 46 51 L46 45 C46 37 50 30 58 30 Z'

function accessory(kind, light, dark) {
  if (kind === 'cap') {
    return `
      <path d="M44 34 C44 14 60 2 77 6 C93 10 100 22 98 34 Z"
            fill="${dark}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
      <path d="M95 24 L122 30 C126 31 126 37 122 38 L95 40 Z"
            fill="${light}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>`
  }
  if (kind === 'antenna') {
    return `
      <path d="M67 14 L67 -6" stroke="#000" stroke-width="10" stroke-linecap="round"/>
      <path d="M67 14 L67 -6" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="67" cy="-12" r="11" fill="${light}" stroke="#000" stroke-width="5"/>`
  }
  return ''
}

function svg(name, light, dark, acc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -26 154 160" width="154" height="160" role="img" aria-label="${name}">
  <g>
    ${accessory(acc, light, dark)}
    <!-- backpack -->
    <path d="M14 52 C14 44 20 40 26 40 L36 40 L36 100 L26 100 C20 100 14 96 14 88 Z"
          fill="${dark}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
    <!-- body -->
    <path d="${BODY}" fill="${light}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
    <!-- shading down the left of the body -->
    <path d="M34 46 C34 30 42 18 54 14 C44 24 41 34 41 48 L41 104 C41 112 44 117 50 119 L45 120 C37 120 34 114 34 104 Z"
          fill="${dark}" opacity="0.55"/>
    <!-- visor -->
    <path d="${VISOR}" fill="#9AD9F5" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
    <path d="M62 38 C70 34 82 34 90 38 C82 40 70 41 62 38 Z" fill="#D8F1FB" opacity="0.9"/>
    <path d="${VISOR}" fill="none" stroke="#5D9FC0" stroke-width="3" opacity="0.7"/>
  </g>
</svg>
`
}

mkdirSync(outDir, { recursive: true })

// Clear out previously generated placeholders (never touches your own art).
for (const f of readdirSync(outDir)) {
  if (/^placeholder-\d+/.test(f)) unlinkSync(join(outDir, f))
}

let n = 0
for (const acc of ACCESSORIES) {
  for (const [name, light, dark] of COLORS) {
    const id = String(n).padStart(2, '0')
    const file = `placeholder-${id}-${name}-${acc}.svg`
    writeFileSync(join(outDir, file), svg(`${name} ${acc}`, light, dark, acc), 'utf8')
    n++
  }
}

console.log(`Wrote ${n} placeholder symbols to src/assets/symbols/`)
if (n !== 57) {
  console.error(`Expected 57, produced ${n}`)
  process.exit(1)
}
