import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const DOC_LABELS = { house_rules: 'House Rules', kyc: 'KYC Form' };

// GET /api/agreements/completed — lists signed agreements, scoped by RLS to the staff
// member's entity, with a short-lived signed URL for each PDF (the bucket is private).
export async function GET() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const { data: agreements, error } = await supabase
    .from('agreements')
    .select('id, doc_type, signed_pdf_url, completed_at, entity_id, entities(name, location_code), clients(company_name, email)')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const withUrls = await Promise.all(
    agreements.map(async (a) => {
      let downloadUrl = null;
      if (a.signed_pdf_url) {
        const { data: signed } = await supabase.storage
          .from('signed-agreements')
          .createSignedUrl(a.signed_pdf_url, 60 * 10); // 10 minutes
        downloadUrl = signed?.signedUrl ?? null;
      }
      return {
        id: a.id,
        docType: a.doc_type,
        docLabel: DOC_LABELS[a.doc_type] ?? a.doc_type,
        entityName: a.entities?.name,
        locationCode: a.entities?.location_code,
        clientCompanyName: a.clients?.company_name,
        clientEmail: a.clients?.email,
        completedAt: a.completed_at,
        downloadUrl,
      };
    })
  );

  return NextResponse.json({ ok: true, agreements: withUrls });
}
