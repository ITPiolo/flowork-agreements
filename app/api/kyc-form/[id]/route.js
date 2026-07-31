import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// GET /api/kyc-form/[id] — public (unauthenticated) prefill data for the client-facing KYC
// form. Scoped to exactly one agreement id (an unguessable UUID emailed only to that client),
// so this intentionally uses the service client rather than requiring a staff session.
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: agreement, error } = await supabase
    .from('agreements')
    .select('id, status, doc_type, entities(name, location_code), clients(company_name, contact_name, email)')
    .eq('id', id)
    .eq('doc_type', 'kyc')
    .single();

  if (error || !agreement) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  if (agreement.status !== 'draft') {
    return NextResponse.json({ ok: false, error: 'This form has already been submitted or is no longer available.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    entityName: agreement.entities?.name,
    locationCode: agreement.entities?.location_code,
    companyName: agreement.clients?.company_name,
    contactName: agreement.clients?.contact_name,
    email: agreement.clients?.email,
  });
}
