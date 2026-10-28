/**
 * Generates the business stamp used on bills (replaces the signature box).
 *
 *   npx tsx scripts/make-stamp.ts [--color "#5B3FA0"] [--font /path/to/Bold.ttf]
 *
 * Writes (transparent PNGs, 1200×1200):
 *   public/brand/stamp.png          coloured stamp for A4 documents
 *   public/brand/stamp-thermal.png  light grey monochrome, for the thermal
 *                                   receipt watermark (prints as a faint tint
 *                                   so item names/prices stay readable)
 *
 * Clean vector artwork, no photo: two concentric rings, "SUTRA COLLECTIONS"
 * along the upper-left arc, "BENGALURU" along the right/lower-right arc, a
 * star at each of the two junctions, empty centre. Letters are placed one by
 * one at equal angular steps (even spacing, no reliance on SVG textPath).
 * Re-run after changing --color; commit the PNGs.
 *
 * Needs a bold sans font: macOS Arial Bold / Verdana Bold and Linux DejaVu Sans
 * Bold are found automatically, or pass --font.
 */
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const COLOR = arg('color') ?? '#5B3FA0';
const FONT_CANDIDATES = [
  arg('font'),
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Verdana Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
].filter(Boolean) as string[];
const FONT = FONT_CANDIDATES.find((f) => fs.existsSync(f));
if (!FONT) {
  console.error('No bold font found. Pass one with --font /path/to/SomeSans-Bold.ttf');
  process.exit(1);
}

const SIZE = 1200;
const C = SIZE / 2;
const OUTER_R = 556, OUTER_W = 26;     // outer ring
const INNER_R = 418, INNER_W = 12;     // inner ring
const TEXT_R = 452;                    // baseline radius of the lettering
const FONT_SIZE = 96;
const STAR_R = 44;                     // star outer radius
const STAR_ORBIT = (OUTER_R - OUTER_W / 2 + INNER_R + INNER_W / 2) / 2; // centre of the text band

// Slots around the full circle, clockwise. Each letter/space takes one slot;
// each star takes one slot with a blank slot on either side.
const TOP = 'SUTRA COLLECTIONS';
const BOTTOM = 'BENGALURU';
const sequence: Array<{ kind: 'char'; ch: string } | { kind: 'star' } | { kind: 'gap' }> = [
  ...TOP.split('').map((ch) => ({ kind: 'char' as const, ch })),
  { kind: 'gap' }, { kind: 'star' }, { kind: 'gap' },
  ...BOTTOM.split('').map((ch) => ({ kind: 'char' as const, ch })),
  { kind: 'gap' }, { kind: 'star' }, { kind: 'gap' },
];
const STEP = 360 / sequence.length;
// Centre "SUTRA COLLECTIONS" on the upper-left (compass angle −50°, 0° = top,
// clockwise positive), which puts BENGALURU on the right/lower-right.
const START = -50 - ((TOP.length - 1) / 2) * STEP;

function starPath(cx: number, cy: number, r: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = ((rot + i * 36 - 90) * Math.PI) / 180;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function svg(color: string): string {
  const parts: string[] = [];
  sequence.forEach((s, i) => {
    const angle = START + i * STEP;
    if (s.kind === 'char' && s.ch !== ' ') {
      // Letter upright on the circle, reading clockwise, baseline at TEXT_R.
      parts.push(
        `<text x="${C}" y="${C - TEXT_R}" transform="rotate(${angle.toFixed(3)} ${C} ${C})" ` +
        `text-anchor="middle" font-family="StampFont" font-weight="bold" font-size="${FONT_SIZE}" fill="${color}" ` +
        // Thin same-colour outline = slightly heavier, rubber-stamp-like letters.
        `stroke="${color}" stroke-width="5" stroke-linejoin="round">${s.ch}</text>`
      );
    } else if (s.kind === 'star') {
      const a = ((angle - 90) * Math.PI) / 180;
      parts.push(`<path d="${starPath(C + STAR_ORBIT * Math.cos(a), C + STAR_ORBIT * Math.sin(a), STAR_R, angle)}" fill="${color}"/>`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${C}" cy="${C}" r="${OUTER_R}" fill="none" stroke="${color}" stroke-width="${OUTER_W}"/>
  <circle cx="${C}" cy="${C}" r="${INNER_R}" fill="none" stroke="${color}" stroke-width="${INNER_W}"/>
  ${parts.join('\n  ')}
</svg>`;
}

function render(svgText: string): Buffer {
  const r = new Resvg(svgText, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: SIZE },
    font: { fontFiles: [FONT!], loadSystemFonts: false, defaultFontFamily: 'StampFont' },
  });
  return r.render().asPng();
}

const outDir = path.join(process.cwd(), 'public', 'brand');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'stamp.png'), render(svg(COLOR)));
// Thermal: neutral light grey. Thermal printers have no colour; a light grey
// tint is dithered into a sparse dot pattern, so text printed over it stays crisp.
fs.writeFileSync(path.join(outDir, 'stamp-thermal.png'), render(svg('#C8C8C8')));
console.log(`Wrote public/brand/stamp.png (${COLOR}) and public/brand/stamp-thermal.png using ${path.basename(FONT)}`);
