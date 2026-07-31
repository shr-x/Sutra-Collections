import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { PdfInvoiceData } from './invoice-template';

// 80 mm thermal roll: usable width ≈ 72 mm ≈ 204 pt
const W = 204;

// ₹ is not in the built-in Courier font — use Rs. instead
const fmt = (n: number): string =>
  `Rs.${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

// Pure ASCII dashed separator — avoids any font/encoding issues
const SEP = '- - - - - - - - - - - - -';

const S = StyleSheet.create({
  page:     { width: W, fontSize: 8, fontFamily: 'Courier', padding: '10 8', color: '#000', backgroundColor: '#fff' },
  center:   { textAlign: 'center' },
  bold:     { fontFamily: 'Courier-Bold' },
  row:      { flexDirection: 'row', justifyContent: 'space-between' },
  logo:     { width: 36, height: 36, alignSelf: 'center', marginBottom: 3 },
  sep:      { textAlign: 'center', marginVertical: 4, fontSize: 7 },
  itemName: { fontFamily: 'Courier-Bold', marginBottom: 1 },
  itemSub:  { fontSize: 7.5 },
  totRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  qrImg:    { width: 70, height: 70, alignSelf: 'center', marginTop: 4 },
});

interface ThermalData extends PdfInvoiceData {
  logoDataUrl?: string;
}

function ThermalDoc({ data }: { data: ThermalData }) {
  const balance = data.grandTotal - (data.amountPaid ?? 0);
  const schemeDisc  = data.schemeDiscount ?? 0;
  const loyaltyDisc = data.loyaltyDiscount ?? 0;

  return (
    <Document>
      {/*
        height: 'auto' lets the page grow to fit content.
        wrap={false} on the inner View prevents page splits.
      */}
      <Page size={{ width: W, height: 'auto' as unknown as number }} style={S.page}>
        <View wrap={false}>
          {/* Logo — only shown when data URL is provided (avoids file-path render split) */}
          {data.logoDataUrl && (
            <Image src={data.logoDataUrl} style={S.logo} />
          )}

          {/* Shop header */}
          <Text style={[S.center, S.bold, { fontSize: 11 }]}>{data.company.name}</Text>
          {data.company.gstin ? (
            <Text style={[S.center, { fontSize: 7, marginTop: 1 }]}>
              GSTIN: {data.company.gstin}
            </Text>
          ) : null}
          {data.company.address ? (
            <Text style={[S.center, { fontSize: 7, marginTop: 1 }]}>
              {data.company.address}
            </Text>
          ) : null}
          {data.company.phone ? (
            <Text style={[S.center, { fontSize: 7, marginTop: 1 }]}>
              Ph: {data.company.phone}
            </Text>
          ) : null}

          <Text style={S.sep}>{SEP}</Text>

          {/* Invoice meta */}
          <Text style={[S.center, S.bold, { marginBottom: 2 }]}>
            {data.docType === 'QUOTATION' ? 'QUOTATION' : 'TAX INVOICE'}
          </Text>
          <View style={S.row}>
            <Text>Invoice #</Text>
            <Text style={S.bold}>{data.invoiceNumber}</Text>
          </View>
          <View style={S.row}>
            <Text>Date</Text>
            <Text>{data.invoiceDate}</Text>
          </View>
          {data.customer.name && data.customer.name !== 'Walk-in Customer' && (
            <View style={S.row}>
              <Text>Customer</Text>
              <Text>{data.customer.name}</Text>
            </View>
          )}
          {data.customer.phone ? (
            <View style={S.row}>
              <Text>Phone</Text>
              <Text>{data.customer.phone}</Text>
            </View>
          ) : null}

          <Text style={S.sep}>{SEP}</Text>

          {/* Line items */}
          {data.items.map((item, i) => (
            <View key={i} style={{ marginBottom: 5 }}>
              <Text style={S.itemName}>{item.description}</Text>
              {item.variant ? (
                <Text style={[S.itemSub, { marginBottom: 1 }]}>  {item.variant}</Text>
              ) : null}
              <View style={S.row}>
                <Text style={S.itemSub}>
                  {/* Pre-GST rate: the stored rate is GST-inclusive, back it out (#2) */}
                  {item.qty} {item.unit} x {fmt(item.gstRate > 0 ? item.rate / (1 + item.gstRate / 100) : item.rate)}
                </Text>
                <Text style={S.bold}>{fmt(item.total)}</Text>
              </View>
              {item.discountAmount > 0 && (
                <View style={S.row}>
                  <Text style={S.itemSub}>  Discount</Text>
                  <Text style={S.itemSub}>-{fmt(item.discountAmount)}</Text>
                </View>
              )}
              {item.gstRate > 0 && (
                <View style={S.row}>
                  <Text style={S.itemSub}>  GST {item.gstRate}%</Text>
                  <Text style={S.itemSub}>{fmt(item.cgst + item.sgst)}</Text>
                </View>
              )}
            </View>
          ))}

          <Text style={S.sep}>{SEP}</Text>

          {/* Totals */}
          {data.invoiceDiscountAmount > 0 && (
            <View style={S.totRow}>
              <Text>Invoice Disc.</Text>
              <Text>-{fmt(data.invoiceDiscountAmount)}</Text>
            </View>
          )}
          <View style={S.totRow}>
            <Text>Taxable</Text>
            <Text>{fmt(data.subtotal - data.totalCgst - data.totalSgst)}</Text>
          </View>
          <View style={S.totRow}>
            <Text>CGST</Text>
            <Text>{fmt(data.totalCgst)}</Text>
          </View>
          <View style={S.totRow}>
            <Text>SGST</Text>
            <Text>{fmt(data.totalSgst)}</Text>
          </View>
          {/* Scheme + loyalty discounts between subtotal and total (#1) */}
          {schemeDisc > 0 && (
            <View style={S.totRow}>
              <Text>Scheme Disc. (B1G1)</Text>
              <Text>-{fmt(schemeDisc)}</Text>
            </View>
          )}
          {loyaltyDisc > 0 && (
            <View style={S.totRow}>
              <Text>Loyalty ({data.loyaltyPoints ?? 0} pts)</Text>
              <Text>-{fmt(loyaltyDisc)}</Text>
            </View>
          )}

          <Text style={S.sep}>{SEP}</Text>

          <View style={S.grandRow}>
            <Text style={[S.bold, { fontSize: 9 }]}>TOTAL</Text>
            <Text style={[S.bold, { fontSize: 9 }]}>{fmt(data.grandTotal)}</Text>
          </View>

          {/* #3: no "Paid" line for cash/UPI. Show Payment Due only if a balance remains. */}
          {balance > 0 && (
            <View style={S.totRow}>
              <Text style={S.bold}>Payment Due</Text>
              <Text style={S.bold}>{fmt(balance)}</Text>
            </View>
          )}

          {/* UPI QR — only render when a real QR image was generated (never show a placeholder box) */}
          {data.upiQrDataUrl && (
            <>
              <Text style={S.sep}>{SEP}</Text>
              <Image src={data.upiQrDataUrl} style={S.qrImg} />
              {data.upiVpa && (
                <Text style={[S.center, { fontSize: 7, marginTop: 2 }]}>
                  UPI: {data.upiVpa}
                </Text>
              )}
            </>
          )}

          <Text style={S.sep}>{SEP}</Text>

          {/*
            Manual break after "shopping at" (never mid-word) keeps the business
            name — however long — together on its own line. hyphenationCallback
            disables react-pdf's default hyphenation so long words/names never
            split mid-word either.
          */}
          <Text
            style={[S.center, { marginTop: 2, fontSize: 6.5 }]}
            hyphenationCallback={(word) => [word]}
          >
            Thank you for shopping at
          </Text>
          <Text
            style={[S.center, { fontSize: 6.5 }]}
            hyphenationCallback={(word) => [word]}
          >
            {data.company.name}!
          </Text>
          <Text style={[S.center, { fontSize: 7, marginTop: 2 }]}>
            Goods once sold are not returnable.
          </Text>
          {data.customTerms && data.customTerms.length > 0 && (
            <>
              <Text style={S.sep}>{SEP}</Text>
              {data.customTerms.map((line, i) => (
                <Text key={i} style={[S.center, { fontSize: 6.5 }]}>{line}</Text>
              ))}
            </>
          )}
          <Text style={[S.center, { fontSize: 6.5, marginTop: 1 }]}>
            Computer generated receipt.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderThermalPdf(data: PdfInvoiceData, logoDataUrl?: string): Promise<Buffer> {
  return renderToBuffer(<ThermalDoc data={{ ...data, logoDataUrl }} />);
}
