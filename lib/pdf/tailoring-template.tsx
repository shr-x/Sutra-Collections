import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const LIGHT  = '#9CA3AF';
const RULE   = '#E5E7EB';
const BG     = '#F9FAFB';
const GRAY60 = '#374151';

const S = StyleSheet.create({
  page: {
    fontSize: 9, fontFamily: 'Helvetica', color: DARK,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 36, paddingTop: 30, paddingBottom: 28,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoImg:     { width: 50, height: 50, objectFit: 'contain', marginRight: 10 },
  logoBox:     { width: 50, height: 50, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', borderRadius: 6, marginRight: 10 },
  logoInit:    { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  coName:      { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK },
  coSub:       { fontSize: 8, color: MUTED, marginTop: 2 },
  coGstin:     { fontSize: 7.5, color: LIGHT, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  docType:     { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginBottom: 3 },
  docNumber:   { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  docDate:     { fontSize: 8, color: MUTED },
  docDeliv:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 1 },

  // ── Accent band ──────────────────────────────────────────────────────────
  accent: { height: 2.5, borderRadius: 1, marginBottom: 14 },

  // ── Info panel — customer PDF only ───────────────────────────────────────
  infoPanel:     { flexDirection: 'row', marginBottom: 14 },
  infoCard:      { flex: 1, borderWidth: 1, borderColor: RULE, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 9 },
  infoCardL:     { marginRight: 6 },
  cardLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 4 },
  cardPrimary:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  cardSecondary: { fontSize: 9, color: MUTED },

  // ── Section divider ───────────────────────────────────────────────────────
  secDiv:   { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  secLine:  { flex: 1, height: 0.5, backgroundColor: RULE },
  secLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, paddingHorizontal: 9 },

  // ── Items table — customer PDF ─────────────────────────────────────────────
  table:       { borderWidth: 1, borderColor: '#D1D5DB', marginBottom: 12 },
  tableHead:   { flexDirection: 'row', backgroundColor: PURPLE, minHeight: 22, alignItems: 'center' },
  tableRow:    { flexDirection: 'row', minHeight: 24, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: RULE },
  tableRowAlt: { backgroundColor: BG },
  cellDesign:  { flex: 3, paddingHorizontal: 8, paddingVertical: 5, borderRightWidth: 0.5, borderRightColor: '#D1D5DB' },
  cellQty:     { flex: 1, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: '#D1D5DB' },
  cellPrice:   { flex: 2, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'flex-end' },
  thText:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.6 },
  tdPrimary:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  tdSecondary: { fontSize: 8, color: MUTED, marginTop: 1 },
  tdCenter:    { fontSize: 9, color: DARK },
  tdRight:     { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── Notes block ───────────────────────────────────────────────────────────
  notesBlock:   { backgroundColor: '#FFFBEB', borderLeftWidth: 3, borderLeftColor: '#F59E0B', paddingLeft: 9, paddingRight: 8, paddingVertical: 7, marginBottom: 12 },
  notesLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  notesBody:    { fontSize: 9, color: DARK, lineHeight: 1.4 },
  notesItemLbl: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 1 },

  // ── Totals — customer PDF ─────────────────────────────────────────────────
  totalsBlock: { alignItems: 'flex-end', marginBottom: 14 },
  totalRow:    { flexDirection: 'row', marginBottom: 2 },
  totalLabel:  { fontSize: 9, color: MUTED, width: 120, textAlign: 'right', paddingRight: 12 },
  totalValue:  { fontSize: 9, color: DARK, width: 80, textAlign: 'right' },
  grandRow:    { flexDirection: 'row', marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: DARK },
  grandLabel:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, width: 120, textAlign: 'right', paddingRight: 12 },
  grandValue:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PURPLE, width: 80, textAlign: 'right' },

  // ── Tailor PDF — design hero (single item) ────────────────────────────────
  heroRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  heroPhoto:    { width: 150, height: 150, objectFit: 'cover', borderRadius: 5, borderWidth: 0.5, borderColor: RULE, marginRight: 18 },
  heroInfo:     { flex: 1, paddingTop: 6 },
  heroName:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 5 },
  heroFabric:   { fontSize: 11, color: MUTED, marginBottom: 4 },

  // ── Tailor PDF — design hero (multi/grouped, per item) ────────────────────
  itemSection:  { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: RULE },
  itemBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemBadge:    { backgroundColor: GRAY60, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  itemBadgeTx:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  heroRowMD:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  heroPhotoMD:  { width: 100, height: 100, objectFit: 'cover', borderRadius: 4, borderWidth: 0.5, borderColor: RULE, marginRight: 14 },
  heroInfoMD:   { flex: 1, paddingTop: 4 },
  heroNameMD:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 },
  heroFabricMD: { fontSize: 10, color: MUTED },

  // ── Measurements table ────────────────────────────────────────────────────
  measTable:  { borderWidth: 1, borderColor: '#D1D5DB', marginBottom: 6 },
  measHead:   { flexDirection: 'row', backgroundColor: GRAY60, minHeight: 19, alignItems: 'center' },
  measRow:    { flexDirection: 'row', minHeight: 21, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: RULE },
  measRowAlt: { backgroundColor: BG },
  measField:  { flex: 2, paddingHorizontal: 7, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: RULE },
  measValue:  { flex: 1, paddingHorizontal: 7, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: RULE },
  measUnit:   { flex: 1, paddingHorizontal: 7, paddingVertical: 4 },
  measHdTx:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  measBodyTx: { fontSize: 9, color: DARK },
  measBold:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  measMuted:  { fontSize: 9, color: MUTED },

  // ── Store Terms (customer copy only) ──────────────────────────────────────
  termsBox:  { marginTop: 4, marginBottom: 14, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 8 },
  termsText: { fontSize: 7, color: MUTED, lineHeight: 1.5 },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer:    { borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 8 },
  footerTx:  { fontSize: 8, color: MUTED, textAlign: 'center' },
  footerSub: { fontSize: 7.5, color: LIGHT, textAlign: 'center', marginTop: 1.5 },
});

const fmtMoney = (n: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TailoringLineItem {
  designName: string;
  colorFabric?: string;
  photoAbsPath?: string;
  qty: number;
  price: number;
  notes?: string;
  measurements: Array<{ fieldName: string; value: string; unit?: string | null }>;
}

export interface TailoringPdfInput {
  docType: 'TAILORING ORDER' | 'PRODUCTION ORDER';
  orderNumber: string;
  orderDate: string;
  dueDate?: string;
  company: {
    name: string; gstin?: string; address?: string;
    phone?: string; logoAbsPath?: string;
  };
  customer: { name: string; phone?: string };
  items: TailoringLineItem[];
  gstRate?: number;
  // Client-editable Terms & Conditions (settings.terms_and_conditions), one
  // bullet per line — customer copy only, omitted entirely when empty.
  customTerms?: string[];
}

export type GroupedTailoringPdfInput = TailoringPdfInput;

// ── Shared sub-components ──────────────────────────────────────────────────────

function PageHeader({ data, isCustomer }: { data: TailoringPdfInput; isCustomer: boolean }) {
  const coSub = [
    data.company.address,
    data.company.phone ? `Ph: ${data.company.phone}` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <View style={S.header}>
      <View style={S.headerLeft}>
        {data.company.logoAbsPath
          ? <Image src={data.company.logoAbsPath} style={S.logoImg} />
          : <View style={S.logoBox}><Text style={S.logoInit}>{data.company.name.charAt(0)}</Text></View>
        }
        <View>
          <Text style={S.coName}>{data.company.name}</Text>
          {coSub ? <Text style={S.coSub}>{coSub}</Text> : null}
          {data.company.gstin ? <Text style={S.coGstin}>GSTIN: {data.company.gstin}</Text> : null}
        </View>
      </View>
      <View style={S.headerRight}>
        <Text style={[S.docType, { color: isCustomer ? PURPLE : DARK }]}>
          {data.docType}
        </Text>
        <Text style={S.docNumber}>#{data.orderNumber}</Text>
        <Text style={S.docDate}>Date: {data.orderDate}</Text>
        {data.dueDate ? <Text style={S.docDeliv}>Delivery: {data.dueDate}</Text> : null}
      </View>
    </View>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={S.secDiv}>
      <View style={S.secLine} />
      <Text style={S.secLabel}>{label}</Text>
      <View style={S.secLine} />
    </View>
  );
}

function MeasurementsTable({ measurements }: { measurements: TailoringLineItem['measurements'] }) {
  if (measurements.length === 0) {
    return <Text style={{ fontSize: 9, color: MUTED }}>No measurements recorded.</Text>;
  }
  return (
    <View style={S.measTable}>
      <View style={S.measHead}>
        <View style={S.measField}><Text style={S.measHdTx}>Measurement</Text></View>
        <View style={S.measValue}><Text style={S.measHdTx}>Value</Text></View>
        <View style={S.measUnit}><Text style={S.measHdTx}>Unit</Text></View>
      </View>
      {measurements.map((m, i) => {
        const rowStyle = { ...S.measRow, ...(i % 2 !== 0 ? S.measRowAlt : {}) };
        return (
          <View key={i} style={rowStyle}>
            <View style={S.measField}><Text style={S.measBodyTx}>{m.fieldName}</Text></View>
            <View style={S.measValue}><Text style={S.measBold}>{m.value}</Text></View>
            <View style={S.measUnit}><Text style={S.measMuted}>{m.unit ?? ''}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

// ── Customer PDF components ───────────────────────────────────────────────────

function CustomerInfoPanel({ data }: { data: TailoringPdfInput }) {
  const multi = data.items.length > 1;
  return (
    <View style={S.infoPanel}>
      <View style={[S.infoCard, S.infoCardL]}>
        <Text style={S.cardLabel}>Customer</Text>
        <Text style={S.cardPrimary}>{data.customer.name}</Text>
        {data.customer.phone ? <Text style={S.cardSecondary}>{data.customer.phone}</Text> : null}
      </View>
      <View style={S.infoCard}>
        <Text style={S.cardLabel}>Order Details</Text>
        <Text style={S.cardPrimary}>{data.orderDate}</Text>
        {data.dueDate ? <Text style={S.cardSecondary}>Delivery: {data.dueDate}</Text> : null}
        <Text style={S.cardSecondary}>{data.items.length} {multi ? 'Items' : 'Item'}</Text>
      </View>
    </View>
  );
}

function CustomerBody({ data }: { data: TailoringPdfInput }) {
  const grandTotal = data.items.reduce((s, i) => s + i.price, 0);
  const gstRate = data.gstRate ?? 0;
  const hasGst = gstRate > 0;
  const taxable = hasGst ? grandTotal / (1 + gstRate / 100) : 0;
  const cgst = hasGst ? taxable * gstRate / 200 : 0;
  const sgst = cgst;
  const multi = data.items.length > 1;
  const noteItems = data.items.filter((i) => !!i.notes);
  const allSameNote = noteItems.length > 0 && noteItems.every((i) => i.notes === noteItems[0].notes);

  return (
    <View>
      <SectionDivider label={multi ? 'Items' : 'Item'} />

      <View style={S.table}>
        <View style={S.tableHead}>
          <View style={S.cellDesign}><Text style={S.thText}>Design / Item</Text></View>
          <View style={S.cellQty}><Text style={S.thText}>Qty</Text></View>
          <View style={S.cellPrice}><Text style={S.thText}>Price</Text></View>
        </View>
        {data.items.map((item, idx) => {
          const rowStyle = { ...S.tableRow, ...(idx % 2 !== 0 ? S.tableRowAlt : {}) };
          return (
            <View key={idx} style={rowStyle}>
              <View style={S.cellDesign}>
                <Text style={S.tdPrimary}>{item.designName}</Text>
                {item.colorFabric ? <Text style={S.tdSecondary}>{item.colorFabric}</Text> : null}
              </View>
              <View style={S.cellQty}><Text style={S.tdCenter}>{item.qty}</Text></View>
              <View style={S.cellPrice}><Text style={S.tdRight}>{fmtMoney(item.price)}</Text></View>
            </View>
          );
        })}
      </View>

      {noteItems.length > 0 && (
        <View style={S.notesBlock}>
          <Text style={S.notesLabel}>Special Instructions</Text>
          {allSameNote ? (
            <Text style={S.notesBody}>{noteItems[0].notes}</Text>
          ) : (
            noteItems.map((item, i) => (
              <View key={i} style={{ marginBottom: i < noteItems.length - 1 ? 4 : 0 }}>
                {multi && <Text style={S.notesItemLbl}>{item.designName}:</Text>}
                <Text style={S.notesBody}>{item.notes}</Text>
              </View>
            ))
          )}
        </View>
      )}

      <View style={S.totalsBlock}>
        {hasGst ? (
          <>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Subtotal</Text>
              <Text style={S.totalValue}>{fmtMoney(taxable)}</Text>
            </View>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>CGST ({(gstRate / 2).toFixed(1)}%)</Text>
              <Text style={S.totalValue}>{fmtMoney(cgst)}</Text>
            </View>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>SGST ({(gstRate / 2).toFixed(1)}%)</Text>
              <Text style={S.totalValue}>{fmtMoney(sgst)}</Text>
            </View>
          </>
        ) : null}
        <View style={S.grandRow}>
          <Text style={S.grandLabel}>{multi ? 'Grand Total' : 'Order Total'}</Text>
          <Text style={S.grandValue}>{fmtMoney(grandTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Tailor PDF components — NO customer data anywhere ─────────────────────────

function TailorItemSection({
  item, index, multi, logoFallback,
}: {
  item: TailoringLineItem;
  index: number;
  multi: boolean;
  logoFallback?: string;
}) {
  const photoSrc = item.photoAbsPath ?? logoFallback;

  if (multi) {
    return (
      <View style={S.itemSection}>
        {/* Item badge */}
        <View style={S.itemBadgeRow}>
          <View style={S.itemBadge}>
            <Text style={S.itemBadgeTx}>Item {String.fromCharCode(65 + index)}</Text>
          </View>
        </View>

        {/* Design hero — medium size for grouped */}
        <View style={S.heroRowMD}>
          {photoSrc ? (
            <Image src={photoSrc} style={S.heroPhotoMD} />
          ) : null}
          <View style={S.heroInfoMD}>
            <Text style={S.heroNameMD}>{item.designName}</Text>
            {item.colorFabric ? <Text style={S.heroFabricMD}>{item.colorFabric}</Text> : null}
          </View>
        </View>

        {/* Notes */}
        {item.notes ? (
          <View style={[S.notesBlock, { marginBottom: 10 }]}>
            <Text style={S.notesLabel}>Special Instructions</Text>
            <Text style={S.notesBody}>{item.notes}</Text>
          </View>
        ) : null}

        {/* Measurements */}
        <SectionDivider label="Measurements" />
        <MeasurementsTable measurements={item.measurements} />
      </View>
    );
  }

  // Single item — full-size hero
  return (
    <View>
      {/* Design hero — large */}
      <View style={S.heroRow}>
        {photoSrc ? (
          <Image src={photoSrc} style={S.heroPhoto} />
        ) : null}
        <View style={S.heroInfo}>
          <Text style={S.heroName}>{item.designName}</Text>
          {item.colorFabric ? <Text style={S.heroFabric}>{item.colorFabric}</Text> : null}
        </View>
      </View>

      {/* Notes */}
      {item.notes ? (
        <View style={S.notesBlock}>
          <Text style={S.notesLabel}>Special Instructions</Text>
          <Text style={S.notesBody}>{item.notes}</Text>
        </View>
      ) : null}

      {/* Measurements */}
      <SectionDivider label="Measurements" />
      <MeasurementsTable measurements={item.measurements} />
    </View>
  );
}

function TailorBody({ data }: { data: TailoringPdfInput }) {
  const multi = data.items.length > 1;
  const logoFallback = data.company.logoAbsPath;
  return (
    <View>
      {data.items.map((item, idx) => (
        <TailorItemSection
          key={idx}
          item={item}
          index={idx}
          multi={multi}
          logoFallback={logoFallback}
        />
      ))}
    </View>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function PageFooter({ company, isCustomer }: { company: TailoringPdfInput['company']; isCustomer: boolean }) {
  const subLine = [
    company.address,
    company.phone ? `Ph: ${company.phone}` : null,
    company.gstin ? `GSTIN: ${company.gstin}` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <View style={S.footer}>
      {isCustomer ? (
        <>
          <Text style={S.footerTx}>{`Thank you for choosing ${company.name}`}</Text>
          {subLine ? <Text style={S.footerSub}>{subLine}</Text> : null}
        </>
      ) : (
        <>
          <Text style={S.footerTx}>{company.name}</Text>
          <Text style={S.footerSub}>Internal production document — confidential</Text>
        </>
      )}
    </View>
  );
}

function StoreTerms({ lines }: { lines: string[] }) {
  return (
    <View style={S.termsBox}>
      <SectionDivider label="Terms" />
      {lines.map((line, i) => (
        // One Text node per line so a long individual line wraps naturally
        // within the page width instead of overflowing or being cut off.
        <Text key={i} style={[S.termsText, { marginBottom: i < lines.length - 1 ? 2 : 0 }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function TailoringPage({ data }: { data: TailoringPdfInput }) {
  const isCustomer = data.docType === 'TAILORING ORDER';
  const accentColor = isCustomer ? PURPLE : GRAY60;

  return (
    <Page size="A4" style={S.page}>
      <PageHeader data={data} isCustomer={isCustomer} />
      <View style={[S.accent, { backgroundColor: accentColor }]} />

      {isCustomer ? (
        <>
          <CustomerInfoPanel data={data} />
          <CustomerBody data={data} />
        </>
      ) : (
        <TailorBody data={data} />
      )}

      <View style={{ flexGrow: 1 }} />
      {isCustomer && data.customTerms && data.customTerms.length > 0 && (
        <StoreTerms lines={data.customTerms} />
      )}
      <PageFooter company={data.company} isCustomer={isCustomer} />
    </Page>
  );
}

// ── Public render functions ───────────────────────────────────────────────────

export async function renderTailoringPdf(data: TailoringPdfInput): Promise<Buffer> {
  const doc = <Document><TailoringPage data={data} /></Document>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}

export async function renderBatchTailoringPdf(pages: TailoringPdfInput[]): Promise<Buffer> {
  const doc = (
    <Document>
      {pages.map((d, i) => <TailoringPage key={i} data={d} />)}
    </Document>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}

export async function renderGroupedTailoringPdf(data: TailoringPdfInput): Promise<Buffer> {
  return renderTailoringPdf(data);
}
