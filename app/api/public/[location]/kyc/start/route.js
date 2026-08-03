import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// POST /api/public/[location]/kyc/start — the public, reusable link's entry point. Creates the
// client + a 'draft' agreement from just a company name and email, then hands off to the exact
// same /kyc-form/[id] page, upload, and submit routes the staff-initiated flow already uses —
// no duplicated form logic, just a different way of getting an agreement created.
export async function POST(request, { params }) {
  const { location } = await params;
  const body = await request.json();
  const companyName = (body.companyName || '').trim();
  const email = (body.email || '').trim();
  const contactName = (body.contactName || '').trim();

  if (!companyName || !email) {
    return NextResponse.json({ ok: false, error: 'companyName and email are required' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('id')
    .eq('location_code', location.toUpperCase())
    .single();
  if (entityError || !entity) {
    return NextResponse.json({ ok: false, error: 'Unknown location' }, { status: 404 });
  }

  const { data: template, error: templateError } = await supabase
    .from('document_templates')
    .select('id')
    .eq('entity_id', entity.id)
    .eq('doc_type', 'kyc')
    .eq('is_active', true)
    .single();
  if (templateError || !template) {
    return NextResponse.json({ ok: false, error: 'KYC form is not available for this location' }, { status: 404 });
  }

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .insert({ company_name: companyName, contact_name: contactName || null, email, entity_id: entity.id })
    .select()
    .single();
  if (clientError) {
    return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
  }

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .insert({ client_id: clientRow.id, entity_id: entity.id, template_id: template.id, doc_type: 'kyc', status: 'draft' })
    .select()
    .single();
  if (agreementError) {
    return NextResponse.json({ ok: false, error: agreementError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agreementId: agreement.id });
}
