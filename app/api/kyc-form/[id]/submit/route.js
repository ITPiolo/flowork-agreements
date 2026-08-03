import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { submitKycAgreement } from '@/lib/agreementSubmission';

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();

  const supabase = getSupabaseServiceClient();

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .select('*, entities(name, location_code), clients(company_name, contact_name, email), document_templates(storage_path)')
    .eq('id', id)
    .eq('doc_type', 'kyc')
    .single();

  if (agreementError || !agreement) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  if (agreement.status !== 'draft') {
    return NextResponse.json({ ok: false, error: 'This form has already been submitted.' }, { status: 409 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  try {
    const { signingUrl } = await submitKycAgreement({
      supabase,
      agreement,
      entity: agreement.entities,
      client: agreement.clients,
      templateStoragePath: agreement.document_templates.storage_path,
      rawValues: body.values,
      uploadedDocuments: body.uploadedDocuments,
      origin,
      returnPath: '/kyc-form/complete',
    });
    return NextResponse.json({ ok: true, signingUrl });
  } catch (err) {
    const detail = err?.response?.body || err?.response?.text || err.message || String(err);
    return NextResponse.json({ ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) }, { status: 500 });
  }
}
