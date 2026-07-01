import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const RULE   = '#E5E7EB';

const S = StyleSheet.create({
  page:       { fontSize: 8, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#FFF', padding: 30 },
  heading:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading: { fontSize: 8, color: MUTED, marginBottom: 12 },
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 10 },
  th:         { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: RULE, alignItems: 'flex-start' },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  footer:     { position: 'absolute', bottom: 18, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7, color: MUTED, textAlign: 'center' },
  cWhen:      { width: 70 },
  cUser:      { width: 60 },
  cAction:    { width: 55 },
  cEntity:    { width: 55 },
  cLabel:     { flex: 1 },
});

export async function GET(req: NextRequest) {
  await requireRole('admin');

  const { searchParams } = req.nextUrl;
  const today = new Date().toISOString().slice(0, 10);
  const from  = searchParams.get('from') ?? today;
  const to    = searchParams.get('to')   ?? today;

  const conditions = [`al.created_at::date BETWEEN $1 AND $2`];
  const params: unknown[] = [from, to];
  if (searchParams.get('user_id'))  { params.push(searchParams.get('user_id'));  conditions.push(`al.user_id=$${params.length}`); }
  if (searchParams.get('action'))   { params.push(searchParams.get('action'));   conditions.push(`al.action=$${params.length}`); }
  if (searchParams.get('entity'))   { params.push(searchParams.get('entity'));   conditions.push(`al.entity_type=$${params.length}`); }

  const res = await query(
    `SELECT al.action, al.entity_type, al.entity_label, al.created_at,
            u.name AS user_name, u.role AS user_role
     FROM audit_log al
     LEFT JOIN users u ON u.id=al.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY al.created_at DESC
     LIMIT 500`,
    params
  );

  const rows = res.rows as Array<{
    action: string; entity_type: string; entity_label: string | null;
    created_at: string; user_name: string | null; user_role: string | null;
  }>;

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', orientation: 'landscape', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Audit Log'),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}  |  ${rows.length} record(s)  |  Admin only`),
      React.createElement(View, { style: S.rule }),

      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.cWhen }, React.createElement(Text, { style: S.th }, 'When')),
        React.createElement(View, { style: S.cUser }, React.createElement(Text, { style: S.th }, 'User')),
        React.createElement(View, { style: S.cAction }, React.createElement(Text, { style: S.th }, 'Action')),
        React.createElement(View, { style: S.cEntity }, React.createElement(Text, { style: S.th }, 'Entity')),
        React.createElement(View, { style: S.cLabel }, React.createElement(Text, { style: S.th }, 'Label'))
      ),

      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.cWhen }, React.createElement(Text, { style: { color: MUTED, fontSize: 7.5 } },
            new Date(row.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          )),
          React.createElement(View, { style: S.cUser }, React.createElement(Text, {}, `${row.user_name ?? '—'}\n${row.user_role ?? ''}`)),
          React.createElement(View, { style: S.cAction }, React.createElement(Text, { style: S.bold }, row.action.replace('_', ' '))),
          React.createElement(View, { style: S.cEntity }, React.createElement(Text, { style: { color: MUTED } }, row.entity_type.replace('_', ' '))),
          React.createElement(View, { style: S.cLabel }, React.createElement(Text, {}, row.entity_label ?? '—'))
        )
      ),

      React.createElement(View, { style: S.footer },
        React.createElement(Text, { style: S.footerText }, `Generated on ${new Date().toLocaleString('en-IN')}  —  Confidential: Admin only`)
      )
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await (renderToBuffer as any)(doc) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-log-${from}-${to}.pdf"`,
    },
  });
}
