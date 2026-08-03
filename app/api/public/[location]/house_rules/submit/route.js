import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { submitHouseRulesAgreement } from '@/lib/agreementSubmission';

// POST /api/public/[location]/house_rules/submit — House Rules has no data entry beyond who's
// signing, so the public link collects just company/contact/email and goes straight to
// generating the envelope and returning an embedded signing URL, in one call.
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
    .select('*')
    .eq('location_code', location.toUpperCase())
    .single();
  if (entityError || !entity) {
    return NextResponse.json({ ok: false, error: 'Unknown location' }, { status: 404 });
  }

  const { data: template, error: templateError } = await supabase
    .from('document_templates')
    .select('*')
    .eq('entity_id', entity.id)
    .eq('doc_type', 'house_rules')
    .eq('is_active', true)
    .single();
  if (templateError || !template) {
    return NextResponse.json({ ok: false, error: 'House Rules is not available for this location' }, { status: 404 });
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
    .insert({ client_id: clientRow.id, entity_id: entity.id, template_id: template.id, doc_type: 'house_rules', status: 'draft' })
    .select()
    .single();
  if (agreementError) {
    return NextResponse.json({ ok: false, error: agreementError.message }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  try {
    const { signingUrl } = await submitHouseRulesAgreement({
      supabase,
      agreement,
      entity,
      client: clientRow,
      templateStoragePath: template.storage_path,
      origin,
      returnPath: '/kyc-form/complete',
    });
    return NextResponse.json({ ok: true, signingUrl });
  } catch (err) {
    const detail = err?.response?.body || err?.response?.text || err.message || String(err);
    return NextResponse.json({ ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) }, { status: 500 });
  }
}
