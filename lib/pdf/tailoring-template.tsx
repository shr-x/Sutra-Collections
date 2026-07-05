import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const LIGHT  = '#9CA3AF';
const RULE   = '#E5E7EB';

const S = StyleSheet.create({
  page: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: DARK,
    backgroundColor: '#FFFFFF',
    padding: 35,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoImg:     { width: 45, height: 45, objectFit: 'contain', marginRight: 8 },
  logoBox: {
    width: 45, height: 45,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: RULE,
  },
  logoInit:    { fontSize: 20, fontFamily: 'Helvetica-Bold', color: DARK },
  coInfo:      { justifyContent: 'center' },
  coName:      { fontSize: 14, fontFamily: 'Helvetica-Bold', color: DARK },
  coSub:       { fontSize: 8, color: MUTED, marginTop: 1 },

  headerRight: { alignItems: 'flex-end' },
  docTitle:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: PURPLE },
  docNum:      { fontSize: 10, color: MUTED, marginTop: 2 },
  docDate:     { fontSize: 9, color: DARK, marginTop: 1 },
  docDelivery: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 1 },

  // ── Rules ────────────────────────────────────────────────────────────────────
  rulePurple: { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 10 },
  ruleGrey:   { borderBottomWidth: 0.5, borderBottomColor: RULE, marginBottom: 8 },

  // ── Amber banner (tailor copy) ────────────────────────────────────────────
  amberBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 0.5,
    borderColor: '#F59E0B',
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  amberText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400E' },

  // ── Info grid ────────────────────────────────────────────────────────────────
  infoGrid:     { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  infoColLeft:  { flex: 1, paddingRight: 12 },
  infoColRight: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  // Card variants — used for customer/design info boxes
  infoCardLeft: {
    flex: 1,
    padding: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 3,
  },
  infoCardRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 3,
  },
  // Compact customer card for grouped layout — no flex: 1 so it sizes to content
  infoCardCustomer: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 3,
  },
  infoColDesignText: { flex: 1, paddingRight: 8 },
  infoLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  infoSub:  { fontSize: 9, color: MUTED, marginTop: 1 },

  // ── Design image / placeholder ────────────────────────────────────────────
  designImg: {
    width: 65, height: 65,
    objectFit: 'contain',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: RULE,
  },
  designPlaceholder: {
    width: 65, height: 65,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: RULE,
  },
  designInit: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: LIGHT },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  // ── Measurements table ────────────────────────────────────────────────────
  measSection:    { marginBottom: 8 },
  measTable:      { borderWidth: 1, borderColor: RULE },
  measRow:        { flexDirection: 'row', minHeight: 20, alignItems: 'center' },
  measRowAlt:     { backgroundColor: '#F9FAFB' },
  measRowBorder:  { borderTopWidth: 0.5, borderTopColor: RULE },
  measCellField: {
    flex: 2,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  measCellValue: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  measCellUnit:  { flex: 1, paddingHorizontal: 5, paddingVertical: 3 },
  measText:      { fontSize: 9, color: DARK },
  measBold:      { fontSize: 9,  fontFamily: 'Helvetica-Bold', color: DARK },
  measBoldLg:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  measMuted:     { fontSize: 9, color: MUTED },

  // ── Notes ────────────────────────────────────────────────────────────────
  notesSection: { marginBottom: 8 },
  notesText:    { fontSize: 9, color: DARK, lineHeight: 1.4 },

  // ── Order total (customer copy) ───────────────────────────────────────────
  totalRow:   { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', marginBottom: 8 },
  totalLabel: { fontSize: 9, color: MUTED, marginRight: 6 },
  totalAmt:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PURPLE },

  // ── Footer (flex-flow, pushed to bottom by flexGrow spacer) ──────────────
  footer:      { paddingTop: 6 },
  footerRule:  { borderTopWidth: 0.5, borderTopColor: RULE, marginBottom: 4 },
  footerText:  { fontSize: 8, color: MUTED, textAlign: 'center' },
  footerText2: { fontSize: 7.5, color: LIGHT, textAlign: 'center', marginTop: 1 },
});

const fmtMoney = (n: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

export interface TailoringPdfInput {
  docType: 'TAILORING ORDER' | 'PRODUCTION ORDER';
  orderNumber: string;
  orderDate: string;
  dueDate?: string;
  company: {
    name: string;
    gstin?: string;
    address?: string;
    phone?: string;
    logoAbsPath?: string;
  };
  /** Omit for tailor copy */
  customer?: { name: string; phone?: string };
  design: { name: string; category?: string; photoAbsPath?: string };
  colorFabric?: string;
  measurements: Array<{ fieldName: string; value: string; unit?: string | null }>;
  notes?: string;
  /** Omit for tailor copy */
  price?: number;
}

function DesignThumb({ photoAbsPath, name }: { photoAbsPath?: string; name: string }) {
  if (photoAbsPath) {
    return <Image src={photoAbsPath} style={S.designImg} />;
  }
  return (
    <View style={S.designPlaceholder}>
      <Text style={S.designInit}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function MeasurementsTable({
  measurements,
  large,
}: {
  measurements: TailoringPdfInput['measurements'];
  large: boolean;
}) {
  const valueStyle = large ? S.measBoldLg : S.measBold;

  if (measurements.length === 0) {
    return <Text style={S.measText}>No measurements recorded.</Text>;
  }

  const headerCellText = {
    fontSize: 7, fontFamily: 'Helvetica-Bold' as const,
    color: '#FFFFFF', textTransform: 'uppercase' as const, letterSpacing: 0.5,
  };

  return (
    <View style={S.measTable}>
      {/* Header row */}
      <View style={{ ...S.measRow, backgroundColor: PURPLE }}>
        <View style={S.measCellField}><Text style={headerCellText}>Measurement</Text></View>
        <View style={S.measCellValue}><Text style={headerCellText}>Value</Text></View>
        <View style={S.measCellUnit}><Text style={headerCellText}>Unit</Text></View>
      </View>
      {measurements.map((m, i) => {
        const isAlt     = i % 2 !== 0;
        const hasBorder = i > 0;
        const rowStyle  = {
          ...S.measRow,
          ...(isAlt     ? S.measRowAlt    : {}),
          ...(hasBorder ? S.measRowBorder : {}),
        };
        return (
          <View key={i} style={rowStyle}>
            <View style={S.measCellField}>
              <Text style={S.measText}>{m.fieldName}</Text>
            </View>
            <View style={S.measCellValue}>
              <Text style={valueStyle}>{m.value}</Text>
            </View>
            <View style={S.measCellUnit}>
              <Text style={S.measMuted}>{m.unit ?? ''}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Single page for one tailoring order — reused for both single and batch renders */
function TailoringPage({ data }: { data: TailoringPdfInput }) {
  const isCustomer = data.docType === 'TAILORING ORDER';
  const coLine = [data.company.address, data.company.phone ? `Ph: ${data.company.phone}` : null]
    .filter(Boolean).join('  |  ');

  return (
    <Page size="A4" style={S.page}>
      {/* ── Header ── */}
      <View style={S.header}>
        <View style={S.headerLeft}>
          {data.company.logoAbsPath ? (
            <Image src={data.company.logoAbsPath} style={S.logoImg} />
          ) : (
            <View style={S.logoBox}>
              <Text style={S.logoInit}>{data.company.name.charAt(0)}</Text>
            </View>
          )}
          <View style={S.coInfo}>
            <Text style={S.coName}>{data.company.name}</Text>
            {coLine ? <Text style={S.coSub}>{coLine}</Text> : null}
            {data.company.gstin ? <Text style={S.coSub}>GSTIN: {data.company.gstin}</Text> : null}
          </View>
        </View>
        <View style={S.headerRight}>
          <Text style={S.docTitle}>{data.docType}</Text>
          <Text style={S.docNum}>#{data.orderNumber}</Text>
          <Text style={S.docDate}>Date: {data.orderDate}</Text>
          {data.dueDate ? <Text style={S.docDelivery}>Delivery: {data.dueDate}</Text> : null}
        </View>
      </View>

      <View style={S.rulePurple} />

      {/* ── Info grid ── */}
      <View style={S.infoGrid}>
        {isCustomer && data.customer && (
          <View style={S.infoCardLeft}>
            <Text style={S.infoLabel}>Customer</Text>
            <Text style={S.infoName}>{data.customer.name}</Text>
            {data.customer.phone ? <Text style={S.infoSub}>{data.customer.phone}</Text> : null}
          </View>
        )}
        <View style={S.infoCardRight}>
          <View style={S.infoColDesignText}>
            <Text style={S.infoLabel}>Design</Text>
            <Text style={S.infoName}>{data.design.name}</Text>
            {data.design.category && data.design.category !== data.design.name
              ? <Text style={S.infoSub}>{data.design.category}</Text>
              : null}
            {data.colorFabric ? <Text style={S.infoSub}>{data.colorFabric}</Text> : null}
          </View>
          <DesignThumb photoAbsPath={data.design.photoAbsPath} name={data.design.name} />
        </View>
      </View>

      <View style={S.ruleGrey} />

      {/* ── Measurements ── */}
      <View style={S.measSection}>
        <Text style={S.sectionLabel}>Measurements</Text>
        <MeasurementsTable measurements={data.measurements} large={!isCustomer} />
      </View>

      <View style={S.ruleGrey} />

      {/* ── Notes / Special Instructions ── */}
      {data.notes ? (
        <View style={S.notesSection}>
          <Text style={S.sectionLabel}>
            {isCustomer ? 'Notes' : 'Special Instructions'}
          </Text>
          <Text style={S.notesText}>{data.notes}</Text>
        </View>
      ) : null}

      {/* ── Order Total (customer copy only) ── */}
      {isCustomer && data.price !== undefined ? (
        <View style={S.totalRow}>
          <Text style={S.totalLabel}>Order Total</Text>
          <Text style={S.totalAmt}>{fmtMoney(data.price)}</Text>
        </View>
      ) : null}

      {/* Flex spacer — pushes footer to bottom of content area */}
      <View style={{ flexGrow: 1 }} />

      {/* ── Footer ── */}
      <View style={S.footer}>
        <View style={S.footerRule} />
        {isCustomer ? (
          <View>
            <Text style={S.footerText}>
              {`Thank you for choosing ${data.company.name}`}
            </Text>
            <Text style={S.footerText2}>
              {[
                data.company.address,
                data.company.phone ? `Ph: ${data.company.phone}` : null,
                data.company.gstin ? `GSTIN: ${data.company.gstin}` : null,
              ].filter(Boolean).join('  |  ')}
            </Text>
          </View>
        ) : (
          <View>
            <Text style={S.footerText}>
              {data.company.name}
              {data.company.phone ? `  |  Phone: ${data.company.phone}` : ''}
            </Text>
            <Text style={S.footerText2}>This is a production document — confidential</Text>
          </View>
        )}
      </View>
    </Page>
  );
}

export async function renderTailoringPdf(data: TailoringPdfInput): Promise<Buffer> {
  const doc = (
    <Document>
      <TailoringPage data={data} />
    </Document>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}

/** Batch PDF: one page per order, all in a single document. */
export async function renderBatchTailoringPdf(pages: TailoringPdfInput[]): Promise<Buffer> {
  const doc = (
    <Document>
      {pages.map((data, i) => (
        <TailoringPage key={i} data={data} />
      ))}
    </Document>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}

// ── Grouped customer PDF (one page, all items, one combined total) ────────────

export interface GroupedTailoringPdfInput {
  /** Base TO number shared by all items, e.g. "TO/2026-27/0029" */
  groupNumber: string;
  orderDate: string;
  dueDate?: string;
  company: {
    name: string;
    gstin?: string;
    address?: string;
    phone?: string;
    logoAbsPath?: string;
  };
  customer: { name: string; phone?: string };
  items: Array<{
    design: { name: string; category?: string; photoAbsPath?: string };
    colorFabric?: string;
    measurements: Array<{ fieldName: string; value: string; unit?: string | null }>;
    notes?: string;
    price: number;
  }>;
  grandTotal: number;
}

const GS = StyleSheet.create({
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: PURPLE,
    marginTop: 10,
    marginBottom: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  itemLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: PURPLE,
  },
  itemPrice: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },
  itemDesignRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemThumb: {
    width: 32,
    height: 32,
    objectFit: 'contain',
    borderRadius: 2,
    marginRight: 8,
  },
  itemThumbBox: {
    width: 32,
    height: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: RULE,
    marginRight: 8,
  },
  itemThumbInit: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: LIGHT },
  itemMeta: { flex: 1 },
  itemDesignName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },
  itemSubText: { fontSize: 8, color: MUTED, marginTop: 1 },
  itemNotes: { fontSize: 8, color: MUTED, marginTop: 2, fontStyle: 'italic' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: DARK,
  },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginRight: 16 },
  grandTotalAmt: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: PURPLE },
});

function GroupedItemThumb({ photoAbsPath, name }: { photoAbsPath?: string; name: string }) {
  if (photoAbsPath) return <Image src={photoAbsPath} style={GS.itemThumb} />;
  return (
    <View style={GS.itemThumbBox}>
      <Text style={GS.itemThumbInit}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function GroupedTailoringPage({ data }: { data: GroupedTailoringPdfInput }) {
  const coLine = [data.company.address, data.company.phone ? `Ph: ${data.company.phone}` : null]
    .filter(Boolean).join('  |  ');

  return (
    <Page size="A4" style={S.page}>
      {/* ── Header ── */}
      <View style={S.header}>
        <View style={S.headerLeft}>
          {data.company.logoAbsPath ? (
            <Image src={data.company.logoAbsPath} style={S.logoImg} />
          ) : (
            <View style={S.logoBox}>
              <Text style={S.logoInit}>{data.company.name.charAt(0)}</Text>
            </View>
          )}
          <View style={S.coInfo}>
            <Text style={S.coName}>{data.company.name}</Text>
            {coLine ? <Text style={S.coSub}>{coLine}</Text> : null}
            {data.company.gstin ? <Text style={S.coSub}>GSTIN: {data.company.gstin}</Text> : null}
          </View>
        </View>
        <View style={S.headerRight}>
          <Text style={S.docTitle}>TAILORING ORDER</Text>
          <Text style={S.docNum}>#{data.groupNumber}</Text>
          <Text style={S.docDate}>Date: {data.orderDate}</Text>
          {data.dueDate ? <Text style={S.docDelivery}>Delivery: {data.dueDate}</Text> : null}
        </View>
      </View>

      <View style={S.rulePurple} />

      {/* ── Customer — compact card, no flex: 1 so it sizes to content ── */}
      <View style={S.infoCardCustomer}>
        <Text style={S.infoLabel}>Customer</Text>
        <Text style={S.infoName}>{data.customer.name}</Text>
        {data.customer.phone ? <Text style={S.infoSub}>{data.customer.phone}</Text> : null}
      </View>

      {/* ── Items ── */}
      {data.items.map((item, idx) => (
        <View key={idx}>
          <View style={GS.itemDivider} />
          <View style={GS.itemHeader}>
            <Text style={GS.itemLabel}>Item {String.fromCharCode(65 + idx)}</Text>
            <Text style={GS.itemPrice}>{fmtMoney(item.price)}</Text>
          </View>
          <View style={GS.itemDesignRow}>
            <GroupedItemThumb
              photoAbsPath={item.design.photoAbsPath}
              name={item.design.name}
            />
            <View style={GS.itemMeta}>
              <Text style={GS.itemDesignName}>{item.design.name}</Text>
              {item.design.category && item.design.category !== item.design.name
                ? <Text style={GS.itemSubText}>{item.design.category}</Text>
                : null}
              {item.colorFabric ? <Text style={GS.itemSubText}>{item.colorFabric}</Text> : null}
            </View>
          </View>
          {item.measurements.length > 0 && (
            <MeasurementsTable measurements={item.measurements} large={false} />
          )}
          {item.notes ? <Text style={GS.itemNotes}>Note: {item.notes}</Text> : null}
        </View>
      ))}

      {/* ── Grand Total ── */}
      <View style={GS.grandTotalRow}>
        <Text style={GS.grandTotalLabel}>Order Total</Text>
        <Text style={GS.grandTotalAmt}>{fmtMoney(data.grandTotal)}</Text>
      </View>

      {/* Flex spacer — pushes footer to bottom of content area */}
      <View style={{ flexGrow: 1 }} />

      {/* ── Footer ── */}
      <View style={S.footer}>
        <View style={S.footerRule} />
        <Text style={S.footerText}>
          {`Thank you for choosing ${data.company.name}`}
        </Text>
        <Text style={S.footerText2}>
          {[
            data.company.address,
            data.company.phone ? `Ph: ${data.company.phone}` : null,
            data.company.gstin ? `GSTIN: ${data.company.gstin}` : null,
          ].filter(Boolean).join('  |  ')}
        </Text>
      </View>
    </Page>
  );
}

/** Customer-facing PDF for a grouped booking — all items on one page with combined total. */
export async function renderGroupedTailoringPdf(data: GroupedTailoringPdfInput): Promise<Buffer> {
  const doc = (
    <Document>
      <GroupedTailoringPage data={data} />
    </Document>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (renderToBuffer as any)(doc) as Promise<Buffer>;
}
