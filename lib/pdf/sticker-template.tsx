import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import * as bwipjs from 'bwip-js/node';

const MM          = 2.835;
const A4_W        = 595.28;
const A4_H        = 841.89;
const PAGE_MARGIN = 5 * MM;
const GUTTER      = 2 * MM;

export type LabelSize = 's20' | 's25' | 'h40' | 'h50' | 'custom';

const STD_DIMS: Record<Exclude<LabelSize, 'custom'>, { wMM: number; hMM: number }> = {
  s20: { wMM: 20, hMM: 20 },
  s25: { wMM: 25, hMM: 25 },
  h40: { wMM: 40, hMM: 60 },
  h50: { wMM: 50, hMM: 75 },
};

type StickerCfg = {
  pad: number;
  catSize: number;      // "ITEM" category label; 0 = omit
  barDisplayH: number;  // barcode Image height in pt; 0 = no barcode
  codeSize: number;
  nameSize: number;
  priceSize: number;
  variantSize: number;  // COLOUR/SIZE labels; 0 = omit
  dateSize: number;     // packed date; 0 = omit
};

// s20: no barcode — too small for reliable Code128 scanning at 20mm width
const STD_CFG: Record<Exclude<LabelSize, 'custom'>, StickerCfg> = {
  s20: { pad: 2.5, catSize: 0,   barDisplayH: 0,  codeSize: 7,   nameSize: 6,   priceSize: 7.5, variantSize: 0,   dateSize: 0   },
  s25: { pad: 3,   catSize: 5.5, barDisplayH: 22, codeSize: 7,   nameSize: 6.5, priceSize: 8.5, variantSize: 0,   dateSize: 0   },
  h40: { pad: 5,   catSize: 7,   barDisplayH: 36, codeSize: 8.5, nameSize: 9,   priceSize: 11,  variantSize: 7,   dateSize: 7   },
  h50: { pad: 6,   catSize: 7.5, barDisplayH: 45, codeSize: 9,   nameSize: 10,  priceSize: 13,  variantSize: 7.5, dateSize: 7.5 },
};

function clamp(min: number, v: number, max: number) { return Math.max(min, Math.min(max, v)); }

function computeCustomCfg(wMM: number, hMM: number): StickerCfg {
  const minDim = Math.min(wMM, hMM);
  const s      = minDim / 25;
  return {
    pad:         clamp(2, Math.round(3 * s), 8),
    catSize:     minDim < 22 ? 0 : clamp(5, Math.round(5.5 * s), 10),
    barDisplayH: minDim < 22 ? 0 : clamp(18, Math.round(22 * s), 55),
    codeSize:    clamp(5, Math.round(7 * s), 12),
    nameSize:    clamp(5, Math.round(6.5 * s), 12),
    priceSize:   clamp(6, Math.round(8.5 * s), 16),
    variantSize: minDim < 30 ? 0 : clamp(5, Math.round(7 * s), 11),
    dateSize:    minDim < 30 ? 0 : clamp(5, Math.round(7 * s), 11),
  };
}

function resolveDims(size: LabelSize, customWMM?: number, customHMM?: number) {
  if (size === 'custom') {
    const wMM = customWMM ?? 30, hMM = customHMM ?? 45;
    return { wPt: wMM * MM, hPt: hMM * MM, wMM, cfg: computeCustomCfg(wMM, hMM) };
  }
  const { wMM, hMM } = STD_DIMS[size];
  return { wPt: wMM * MM, hPt: hMM * MM, wMM, cfg: STD_CFG[size] };
}

// ── Barcode ───────────────────────────────────────────────────────────────────

async function generateBarcodeUri(code: string, displayWidthPt: number): Promise<string | null> {
  try {
    // Higher scale for wider display → better print quality
    const scale    = displayWidthPt >= 100 ? 4 : 3;
    const heightMM = displayWidthPt >= 100 ? 15 : displayWidthPt >= 60 ? 10 : 8;
    const png = await bwipjs.toBuffer({
      bcid:            'code128',
      text:            code,
      scale,
      height:          heightMM,
      includetext:     false,
      guardwhitespace: true,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StickerCode {
  code: string;
  itemName: string;
  price: number;
  sizeName?: string;
  colorName?: string;
  date?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRealVariant(v?: string): boolean {
  if (!v) return false;
  const l = v.toLowerCase().trim();
  return !['regular', 'default', 'standard', 'n/a', 'none', '-', ''].includes(l);
}

function fmtPrice(price: number): string {
  return `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(price)}`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  cell:        { borderWidth: 0.5, borderColor: '#000000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  catLabel:    { color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2, fontFamily: 'Helvetica' },
  barImg:      { marginBottom: 1 },
  codeText:    { fontFamily: 'Helvetica-Bold', color: '#111827', textAlign: 'center', letterSpacing: 0.4, marginBottom: 2 },
  nameText:    { fontFamily: 'Helvetica', color: '#374151', textAlign: 'center' },
  divider:     { borderBottomWidth: 0.3, borderBottomColor: '#CCCCCC', alignSelf: 'stretch', marginVertical: 2 },
  priceRow:    { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 1 },
  priceLbl:    { fontFamily: 'Helvetica', color: '#6B7280', marginRight: 2 },
  priceVal:    { fontFamily: 'Helvetica-Bold', color: '#111827' },
  variantRow:  { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 },
  variantTx:   { fontFamily: 'Helvetica', color: '#374151', marginHorizontal: 2 },
  dateTx:      { fontFamily: 'Helvetica', color: '#9CA3AF', textAlign: 'center', marginTop: 2 },
});

// ── Sticker cell ──────────────────────────────────────────────────────────────

function StickerCell({
  sticker, wPt, hPt, cfg, barcodeUri,
}: {
  sticker: StickerCode; wPt: number; hPt: number;
  cfg: StickerCfg; barcodeUri: string | null;
}) {
  const showBarcode = cfg.barDisplayH > 0 && !!barcodeUri;
  const showColor   = cfg.variantSize > 0 && isRealVariant(sticker.colorName);
  const showSize    = cfg.variantSize > 0 && isRealVariant(sticker.sizeName);
  const showDate    = cfg.dateSize > 0 && !!sticker.date;
  const barW        = wPt - cfg.pad * 2;

  return (
    <View style={[S.cell, { width: wPt, height: hPt, padding: cfg.pad }]}>
      {cfg.catSize > 0 && (
        <Text style={[S.catLabel, { fontSize: cfg.catSize }]}>ITEM</Text>
      )}

      {showBarcode && (
        <Image
          src={barcodeUri!}
          style={[S.barImg, { width: barW, height: cfg.barDisplayH }]}
        />
      )}

      <Text style={[S.codeText, { fontSize: cfg.codeSize }]}>{sticker.code}</Text>

      <Text style={[S.nameText, { fontSize: cfg.nameSize }]}>{sticker.itemName}</Text>

      {(showColor || showSize) && (
        <>
          <View style={S.divider} />
          <View style={S.variantRow}>
            {showColor && (
              <Text style={[S.variantTx, { fontSize: cfg.variantSize }]}>
                {`COLOUR: ${sticker.colorName}`}
              </Text>
            )}
            {showSize && (
              <Text style={[S.variantTx, { fontSize: cfg.variantSize }]}>
                {`SIZE: ${sticker.sizeName}`}
              </Text>
            )}
          </View>
        </>
      )}

      <View style={S.divider} />

      <View style={S.priceRow}>
        <Text style={[S.priceLbl, { fontSize: cfg.priceSize * 0.72 }]}>MRP</Text>
        <Text style={[S.priceVal, { fontSize: cfg.priceSize }]}>{fmtPrice(sticker.price)}</Text>
      </View>

      {showDate && (
        <Text style={[S.dateTx, { fontSize: cfg.dateSize }]}>
          {`Packed: ${sticker.date}`}
        </Text>
      )}
    </View>
  );
}

// ── Sheet renderer ────────────────────────────────────────────────────────────

export async function renderStickerSheet(
  stickers: StickerCode[],
  size: LabelSize,
  _logoAbsPath?: string,   // kept for backwards-compat signature; ignored
  customWMM?: number,
  customHMM?: number,
): Promise<Buffer> {
  const { wPt, hPt, cfg } = resolveDims(size, customWMM, customHMM);
  const barW = wPt - cfg.pad * 2;

  // Pre-generate all barcodes in parallel
  const barcodeUris = await Promise.all(
    stickers.map((s) =>
      cfg.barDisplayH > 0 ? generateBarcodeUri(s.code, barW) : Promise.resolve(null),
    ),
  );

  const availW  = A4_W - 2 * PAGE_MARGIN + GUTTER;
  const availH  = A4_H - 2 * PAGE_MARGIN + GUTTER;
  const cols    = Math.max(1, Math.floor(availW / (wPt + GUTTER)));
  const rows    = Math.max(1, Math.floor(availH / (hPt + GUTTER)));
  const perPage = cols * rows;

  type Entry = { sticker: StickerCode; uri: string | null };
  const pages: Entry[][] = [];
  for (let i = 0; i < stickers.length; i += perPage) {
    pages.push(
      stickers.slice(i, i + perPage).map((s, j) => ({ sticker: s, uri: barcodeUris[i + j] })),
    );
  }
  if (pages.length === 0) pages.push([]);

  const doc = (
    <Document>
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={{ padding: PAGE_MARGIN }}>
          {Array.from({ length: rows }).map((_, ri) => (
            <View key={ri} style={{ flexDirection: 'row', marginBottom: ri < rows - 1 ? GUTTER : 0 }}>
              {Array.from({ length: cols }).map((_, ci) => {
                const entry = page[ri * cols + ci];
                const mr = ci < cols - 1 ? GUTTER : 0;
                return entry ? (
                  <View key={ci} style={{ marginRight: mr }}>
                    <StickerCell
                      sticker={entry.sticker}
                      wPt={wPt} hPt={hPt}
                      cfg={cfg}
                      barcodeUri={entry.uri}
                    />
                  </View>
                ) : (
                  <View key={ci} style={{ width: wPt, height: hPt, marginRight: mr }} />
                );
              })}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}
