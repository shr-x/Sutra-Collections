import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';

// ₹ is unsupported in the built-in Helvetica/Courier Type-1 fonts.
// All monetary values in PDFs use "Rs." instead.
const fmt = (n: number): string =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

// Plain number (no "Rs." prefix) — used in dense table cells like the GST summary
// so each column doesn't repeat "Rs." and wrap (was rendering as "Rs.Rs.").
const num = (n: number): string =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Indian GSTINs are exactly 15 chars; suppress anything else (e.g. "0000") so
// invalid/placeholder values aren't printed as a GSTIN.
const validGstin = (g?: string | null): string | null => {
  const v = (g ?? '').trim();
  return v.length === 15 ? v : null;
};

const BLACK = '#000000';
const DARK  = '#111827';
const MUTED = '#6B7280';
const RULE  = '#D1D5DB';
const THEAD = '#F5F5F5';

const S = StyleSheet.create({
  page: {
    fontSize: 9, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#fff',
    // Thin black border around the page via padding (actual border on Page is not reliable)
    paddingTop: 0, paddingBottom: 0,
  },

  // Thin black outer border drawn as an absolute View
  outerBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 0.75, borderColor: BLACK,
  },

  // ── Header ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20 32 16 32',
    borderBottomWidth: 0.5, borderBottomColor: RULE,
  },
  logo: { width: 44, height: 44, objectFit: 'contain', marginRight: 10 },
  logoPlaceholder: {
    width: 44, height: 44, borderRadius: 3, borderWidth: 0.5, borderColor: RULE,
    backgroundColor: THEAD, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  logoInitial: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: DARK },
  companyDetail: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BLACK },
  docMeta: { fontSize: 8, color: MUTED, marginTop: 3 },
  docMetaVal: { fontFamily: 'Helvetica-Bold', color: DARK },

  // ── Content area ──
  content: { paddingHorizontal: 32, paddingBottom: 40 },

  // ── Bill To ──
  billSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: RULE,
  },
  sectionLabel: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  customerName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },
  customerDetail: { fontSize: 8, color: MUTED, marginTop: 2 },
  badge: {
    borderWidth: 0.5, borderColor: RULE,
    borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3,
  },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── E-Way banner ──
  eWayBanner: {
    borderWidth: 0.5, borderColor: '#F59E0B', borderRadius: 3,
    padding: '6 10', marginTop: 10,
  },
  eWayText: { fontSize: 8, color: '#92400E', fontFamily: 'Helvetica-Bold' },

  // ── Items table ──
  tableWrap: { marginTop: 12 },
  tableHead: {
    flexDirection: 'row', backgroundColor: THEAD,
    borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: RULE,
    paddingVertical: 5, paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: RULE,
    paddingVertical: 5, paddingHorizontal: 4,
  },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase' },
  td: { fontSize: 8, color: DARK },
  tdMuted: { fontSize: 8, color: MUTED },
  colItem: { flex: 1 },
  colHsn:  { width: 40 },
  colQty:  { width: 44, textAlign: 'right' },
  colRate: { width: 62, textAlign: 'right' },
  colDisc: { width: 52, textAlign: 'right' },
  colGst:  { width: 32, textAlign: 'right' },
  colAmt:  { width: 68, textAlign: 'right' },

  // ── Summary block ──
  summaryRow: { flexDirection: 'row', marginTop: 14 },
  gstBox:  { flex: 1, marginRight: 12 },
  gstHead: {
    flexDirection: 'row', backgroundColor: THEAD,
    borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: RULE,
    paddingVertical: 4, paddingHorizontal: 4,
  },
  gstRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3, borderBottomColor: RULE,
    paddingVertical: 3, paddingHorizontal: 4,
  },
  gstColW:    { width: 58, textAlign: 'right', paddingLeft: 4 },
  gstColFlex: { flex: 1 },
  gstTh: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED },
  gstTd: { fontSize: 8 },
  totalsBox:   { width: 200 },
  totalsLine:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalsLabel: { fontSize: 8, color: MUTED },
  totalsValue: { fontSize: 8 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: RULE, marginVertical: 6 },
  grandLine:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  grandLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },
  grandValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── Payment / QR / Notes / Signature row ──
  bottomRow: {
    flexDirection: 'row', marginTop: 16,
    borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 12,
  },
  payBox:  { width: 130, marginRight: 16 },
  notesBox: { flex: 1, marginRight: 16 },
  sigBox:  { width: 110 },
  boxLabel: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
  },
  qrImg: { width: 64, height: 64 },
  qrPlaceholder: {
    width: 64, height: 64, borderWidth: 0.5, borderColor: RULE,
    alignItems: 'center', justifyContent: 'center',
  },
  sigLine: { borderTopWidth: 0.5, borderTopColor: RULE, marginTop: 36, paddingTop: 4 },
  sigText: { fontSize: 7, color: MUTED, textAlign: 'center' },

  // ── Terms ──
  termsBox: {
    marginTop: 12, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 8,
  },
  termsText: { fontSize: 7, color: MUTED, lineHeight: 1.5 },

  // ── Footer ──
  footer: {
    position: 'absolute', bottom: 14, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.3, borderTopColor: RULE, paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: MUTED },
});

export interface PdfCompany {
  name: string;
  gstin: string;
  address: string;
  state: string;
  phone?: string;
  email?: string;
  logoAbsPath?: string;
}

export interface PdfCustomer {
  name: string;
  address: string;
  gstin?: string;
  phone?: string;
}

export interface PdfLineItem {
  description: string;
  variant?: string;        // e.g. "Red / M" — omit for Regular/None
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discountAmount: number;
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface PdfInvoiceData {
  docType: 'INVOICE' | 'QUOTATION' | 'PURCHASE' | 'CREDIT NOTE' | 'DEBIT NOTE' | 'PROFORMA';
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  company: PdfCompany;
  customer: PdfCustomer;
  items: PdfLineItem[];
  invoiceDiscountAmount: number;
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  grandTotal: number;
  amountPaid?: number;
  paymentMode?: string;
  notes?: string;
  isScheme?: boolean;
  // Shown as a small label near the totals — e.g. purchase invoices' "(Tax Inclusive)" / "(Tax Exclusive)".
  taxModeLabel?: string;
  upiVpa?: string;
  upiQrDataUrl?: string;
  // Scheme (BOGO) and loyalty redemption shown as their own discount lines
  schemeDiscount?: number;
  loyaltyDiscount?: number;
  loyaltyPoints?: number;
  // Credit-note specific
  originalInvoiceNumber?: string;
  refundMode?: string;
  // Client-editable Terms & Conditions (settings.terms_and_conditions), split
  // into one bullet per line. Omitted entirely when empty.
  customTerms?: string[];
  // Overrides the small orange subtitle shown under "PROFORMA INVOICE"
  // (docType 'PROFORMA' only). Defaults to the initial-estimate wording below
  // if not set — used to distinguish the order-creation proforma from the
  // ready-for-pickup "balance update" proforma variant.
  proformaSubtitle?: string;
}

function InvoiceDoc({ data }: { data: PdfInvoiceData }) {
  const balance    = data.grandTotal - (data.amountPaid ?? 0);
  const showEWay   = data.grandTotal > 50000;
  const taxableSum = data.subtotal - data.totalCgst - data.totalSgst;

  // Return documents (credit/debit notes) get a distinct coloured header so they
  // are never mistaken for a normal tax invoice. Credit note = red, debit = orange.
  const isCreditNote = data.docType === 'CREDIT NOTE';
  const isDebitNote  = data.docType === 'DEBIT NOTE';
  const isProforma   = data.docType === 'PROFORMA';
  const isReturnDoc  = isCreditNote || isDebitNote;
  const accent       = isCreditNote ? '#DC2626' : isDebitNote ? '#EA580C' : BLACK;
  const accentBg     = isCreditNote ? '#FEF2F2' : isDebitNote ? '#FFF7ED' : undefined;

  // Scheme + loyalty discount lines (shown between subtotal and grand total).
  const schemeDisc  = data.schemeDiscount ?? 0;
  const loyaltyDisc = data.loyaltyDiscount ?? 0;

  const gstGroups: Record<number, { taxable: number; cgst: number; sgst: number }> = {};
  for (const item of data.items) {
    if (!gstGroups[item.gstRate])
      gstGroups[item.gstRate] = { taxable: 0, cgst: 0, sgst: 0 };
    gstGroups[item.gstRate].taxable += item.taxableValue;
    gstGroups[item.gstRate].cgst   += item.cgst;
    gstGroups[item.gstRate].sgst   += item.sgst;
  }

  const companyInitial = (data.company.name || 'S')[0].toUpperCase();

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Thin outer border */}
        <View style={S.outerBorder} />

        {/* ── Header: logo + company left / doc title right ── */}
        <View style={[S.header, isReturnDoc ? { backgroundColor: accentBg, borderBottomColor: accent, borderBottomWidth: 2 } : {}]}>
          <View style={S.headerLeft}>
            {data.company.logoAbsPath ? (
              <Image src={data.company.logoAbsPath} style={S.logo} />
            ) : (
              <View style={S.logoPlaceholder}>
                <Text style={S.logoInitial}>{companyInitial}</Text>
              </View>
            )}
            <View>
              <Text style={S.companyName}>{data.company.name}</Text>
              {data.company.address ? (
                <Text style={S.companyDetail}>{data.company.address}</Text>
              ) : null}
              {validGstin(data.company.gstin) ? (
                <Text style={S.companyDetail}>GSTIN: {validGstin(data.company.gstin)}</Text>
              ) : null}
              {data.company.state ? (
                <Text style={S.companyDetail}>State: {data.company.state}</Text>
              ) : null}
              {data.company.phone ? (
                <Text style={S.companyDetail}>Ph: {data.company.phone}</Text>
              ) : null}
              {data.company.email ? (
                <Text style={S.companyDetail}>{data.company.email}</Text>
              ) : null}
            </View>
          </View>

          <View style={S.headerRight}>
            <Text style={[S.docTitle, isReturnDoc ? { color: accent } : {}]}>
              {data.docType === 'QUOTATION' ? 'QUOTATION'
                : data.docType === 'PURCHASE' ? 'PURCHASE INVOICE'
                : data.docType === 'CREDIT NOTE' ? 'CREDIT NOTE'
                : data.docType === 'DEBIT NOTE' ? 'DEBIT NOTE'
                : data.docType === 'PROFORMA' ? 'PROFORMA INVOICE'
                : 'TAX INVOICE'}
            </Text>
            {isReturnDoc ? (
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: accent, marginTop: 2 }}>
                {isCreditNote ? 'SALES RETURN / REFUND' : 'PURCHASE RETURN'}
              </Text>
            ) : null}
            {isProforma ? (
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#B45309', marginTop: 2 }}>
                {data.proformaSubtitle ?? 'ESTIMATE ONLY — NOT A GST TAX INVOICE'}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, gap: 4 }}>
              <Text style={S.docMeta}>#</Text>
              <Text style={[S.docMeta, S.docMetaVal]}>{data.invoiceNumber}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2, gap: 4 }}>
              <Text style={S.docMeta}>Date:</Text>
              <Text style={[S.docMeta, S.docMetaVal]}>{data.invoiceDate}</Text>
            </View>
            {data.dueDate ? (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2, gap: 4 }}>
                <Text style={S.docMeta}>Due:</Text>
                <Text style={[S.docMeta, S.docMetaVal]}>{data.dueDate}</Text>
              </View>
            ) : null}
            {data.isScheme ? (
              <Text style={[S.docMeta, { marginTop: 4, fontFamily: 'Helvetica-Bold' }]}>
                SCHEME INVOICE
              </Text>
            ) : null}
          </View>
        </View>

        <View style={S.content}>
          {showEWay && (
            <View style={S.eWayBanner}>
              <Text style={S.eWayText}>
                Invoice value exceeds Rs. 50,000 — E-Way Bill required before dispatch.
              </Text>
            </View>
          )}

          {/* ── Bill To ── */}
          <View style={S.billSection}>
            <View style={{ flex: 1 }}>
              <Text style={S.sectionLabel}>{data.docType === 'PURCHASE' ? 'Supplier' : 'Bill To'}</Text>
              <Text style={S.customerName}>{data.customer.name}</Text>
              {data.customer.phone ? (
                <Text style={S.customerDetail}>Ph: {data.customer.phone}</Text>
              ) : null}
              {data.customer.address ? (
                <Text style={S.customerDetail}>{data.customer.address}</Text>
              ) : null}
              {validGstin(data.customer.gstin) ? (
                <Text style={S.customerDetail}>GSTIN: {validGstin(data.customer.gstin)}</Text>
              ) : null}
              {isReturnDoc && data.originalInvoiceNumber ? (
                <Text style={[S.customerDetail, { marginTop: 3, color: accent, fontFamily: 'Helvetica-Bold' }]}>
                  Against Invoice: {data.originalInvoiceNumber}
                </Text>
              ) : null}
              {isReturnDoc && data.refundMode ? (
                <Text style={[S.customerDetail, { color: accent }]}>Refund Mode: {data.refundMode}</Text>
              ) : null}
            </View>
            <View style={[S.badge, isReturnDoc ? { borderColor: accent, backgroundColor: accentBg } : {}]}>
              <Text style={[S.badgeText, isReturnDoc ? { color: accent } : {}]}>
                {data.docType === 'QUOTATION' ? 'QUOTATION COPY'
                  : data.docType === 'PURCHASE' ? 'PURCHASE RECORD'
                  : data.docType === 'CREDIT NOTE' ? 'CREDIT NOTE COPY'
                  : data.docType === 'DEBIT NOTE' ? 'DEBIT NOTE COPY'
                  : data.docType === 'PROFORMA' ? 'PROFORMA COPY'
                  : 'ORIGINAL FOR RECIPIENT'}
              </Text>
            </View>
          </View>

          {/* ── Line Items Table ── */}
          <View style={S.tableWrap}>
            <View style={S.tableHead}>
              <View style={S.colItem}><Text style={S.th}>Item</Text></View>
              <View style={S.colHsn}><Text style={S.th}>HSN</Text></View>
              <View style={S.colQty}><Text style={S.th}>Qty</Text></View>
              <View style={S.colRate}><Text style={S.th}>Rate</Text></View>
              <View style={S.colDisc}><Text style={S.th}>Disc.</Text></View>
              <View style={S.colGst}><Text style={S.th}>GST</Text></View>
              <View style={S.colAmt}><Text style={S.th}>Amount</Text></View>
            </View>
            {data.items.map((item, i) => (
              <View key={i} style={S.tableRow}>
                <View style={S.colItem}>
                  <Text style={S.td}>{item.description}</Text>
                  {item.variant ? <Text style={[S.tdMuted, { fontSize: 7.5, marginTop: 1 }]}>{item.variant}</Text> : null}
                </View>
                <View style={S.colHsn}><Text style={S.tdMuted}>{item.hsn || '—'}</Text></View>
                <View style={S.colQty}>
                  <Text style={[S.td, { textAlign: 'right' }]}>
                    {item.qty} {item.unit}
                  </Text>
                </View>
                <View style={S.colRate}>
                  <Text style={[S.td, { textAlign: 'right' }]}>{fmt(item.rate)}</Text>
                </View>
                <View style={S.colDisc}>
                  <Text style={[S.td, { textAlign: 'right' }]}>
                    {item.discountAmount > 0 ? `-${fmt(item.discountAmount)}` : '—'}
                  </Text>
                </View>
                <View style={S.colGst}>
                  <Text style={[S.td, { textAlign: 'right' }]}>{item.gstRate}%</Text>
                </View>
                <View style={S.colAmt}>
                  <Text style={[S.td, { textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                    {fmt(item.total)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── GST Summary + Totals ── */}
          <View style={S.summaryRow}>
            {/* GST Summary */}
            <View style={S.gstBox}>
              <Text style={S.sectionLabel}>GST Summary (Rs.)</Text>
              <View style={S.gstHead}>
                <View style={S.gstColFlex}><Text style={S.gstTh}>Rate</Text></View>
                <View style={S.gstColW}><Text style={S.gstTh}>Taxable</Text></View>
                <View style={S.gstColW}><Text style={S.gstTh}>CGST</Text></View>
                <View style={S.gstColW}><Text style={S.gstTh}>SGST</Text></View>
              </View>
              {Object.entries(gstGroups).map(([rate, g]) => (
                <View key={rate} style={S.gstRow}>
                  <View style={S.gstColFlex}><Text style={S.gstTd}>{rate}%</Text></View>
                  <View style={S.gstColW}>
                    <Text style={[S.gstTd, { textAlign: 'right' }]}>{num(g.taxable)}</Text>
                  </View>
                  <View style={S.gstColW}>
                    <Text style={[S.gstTd, { textAlign: 'right' }]}>{num(g.cgst)}</Text>
                  </View>
                  <View style={S.gstColW}>
                    <Text style={[S.gstTd, { textAlign: 'right' }]}>{num(g.sgst)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={S.totalsBox}>
              {data.invoiceDiscountAmount > 0 && (
                <View style={S.totalsLine}>
                  <Text style={S.totalsLabel}>Invoice Discount</Text>
                  <Text style={S.totalsValue}>-{fmt(data.invoiceDiscountAmount)}</Text>
                </View>
              )}
              <View style={S.totalsLine}>
                <Text style={S.totalsLabel}>Taxable Value</Text>
                <Text style={S.totalsValue}>{fmt(taxableSum)}</Text>
              </View>
              <View style={S.totalsLine}>
                <Text style={S.totalsLabel}>CGST</Text>
                <Text style={S.totalsValue}>{fmt(data.totalCgst)}</Text>
              </View>
              <View style={S.totalsLine}>
                <Text style={S.totalsLabel}>SGST</Text>
                <Text style={S.totalsValue}>{fmt(data.totalSgst)}</Text>
              </View>
              {/* Scheme + loyalty discounts shown between subtotal and grand total (#1) */}
              {schemeDisc > 0 && (
                <View style={S.totalsLine}>
                  <Text style={[S.totalsLabel, { color: '#B91C1C' }]}>Scheme Discount</Text>
                  <Text style={[S.totalsValue, { color: '#B91C1C' }]}>-{fmt(schemeDisc)}</Text>
                </View>
              )}
              {loyaltyDisc > 0 && (
                <View style={S.totalsLine}>
                  <Text style={[S.totalsLabel, { color: '#7C3AED' }]}>Loyalty Points ({data.loyaltyPoints ?? 0} pts)</Text>
                  <Text style={[S.totalsValue, { color: '#7C3AED' }]}>-{fmt(loyaltyDisc)}</Text>
                </View>
              )}
              <View style={S.divider} />
              <View style={S.grandLine}>
                <Text style={S.grandLabel}>GRAND TOTAL</Text>
                <Text style={S.grandValue}>{fmt(data.grandTotal)}</Text>
              </View>
              {data.taxModeLabel && (
                <Text style={[S.totalsLabel, { textAlign: 'right', marginTop: 2 }]}>{data.taxModeLabel}</Text>
              )}
              {/* #3: no "Paid" line for cash/UPI. Show Payment Due only on invoices
                  with an outstanding balance (never on credit/debit notes). */}
              {(data.docType === 'INVOICE' || isProforma) && balance > 0 && (
                <View style={[S.totalsLine, { marginTop: 4 }]}>
                  <Text style={[S.totalsLabel, { color: '#B91C1C' }]}>Payment Due</Text>
                  <Text style={[S.totalsValue, { color: '#B91C1C' }]}>{fmt(balance)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Payment / Notes / Signature ── */}
          <View style={S.bottomRow}>
            {(data.upiVpa || data.upiQrDataUrl) && (
              <View style={S.payBox}>
                <Text style={S.boxLabel}>Payment</Text>
                {data.upiQrDataUrl ? (
                  <Image src={data.upiQrDataUrl} style={S.qrImg} />
                ) : (
                  <View style={S.qrPlaceholder}>
                    <Text style={{ fontSize: 7, color: MUTED, textAlign: 'center' }}>UPI QR</Text>
                  </View>
                )}
                {data.upiVpa && (
                  <Text style={{ fontSize: 7, color: MUTED, marginTop: 3 }}>
                    UPI: {data.upiVpa}
                  </Text>
                )}
              </View>
            )}

            {data.notes && (
              <View style={S.notesBox}>
                <Text style={S.boxLabel}>Notes</Text>
                <Text style={{ fontSize: 8, color: DARK }}>{data.notes}</Text>
              </View>
            )}

            <View style={[S.sigBox, { marginLeft: 'auto' }]}>
              <Text style={S.boxLabel}>For {data.company.name}</Text>
              <View style={S.sigLine}>
                <Text style={S.sigText}>Authorised Signatory</Text>
              </View>
            </View>
          </View>

          {/* ── Terms ── */}
          <View style={S.termsBox}>
            <Text style={[S.sectionLabel, { marginBottom: 3 }]}>Terms &amp; Conditions</Text>
            <Text style={S.termsText}>
              1. Goods once sold will not be taken back or exchanged.{'\n'}
              2. All disputes are subject to local jurisdiction only.{'\n'}
              3. E. &amp; O.E. — subject to realisation of cheque/payment.{'\n'}
              4. Interest @ 18% p.a. will be charged on overdue payments.
            </Text>
          </View>

          {data.customTerms && data.customTerms.length > 0 && (
            <View style={[S.termsBox, { marginTop: 6 }]}>
              <Text style={[S.sectionLabel, { marginBottom: 3 }]}>Store Terms</Text>
              <Text style={S.termsText}>
                {data.customTerms.map((line, i) => `${i > 0 ? '\n' : ''}${line}`).join('')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Page Footer ── */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            This is a computer-generated document. No physical signature is required.
          </Text>
          <Text style={S.footerText}>{data.company.name}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: PdfInvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc data={data} />);
}
