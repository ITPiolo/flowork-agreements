import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const DOC_LABELS = { house_rules: 'House Rules', kyc: 'KYC Form' };

// GET /api/agreements/completed — lists all agreements (any status), scoped by RLS to the
// staff member's entity, with short-lived signed URLs for the completed PDF (once DocuSign
// Connect marks it signed) and any documents the client uploaded on the KYC web form. Listing
// every status — not just completed — matters here: until the DocuSign Connect webhook is
// registered, agreements never reach 'completed' at all, so this is staff's only visibility
// into what's in progress and what clients have already attached.
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
    .select('id, doc_type, status, signed_pdf_url, fields, sent_at, completed_at, created_at, entity_id, entities(name, location_code), clients(company_name, email)')
    .order('created_at', { ascending: false });
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

      const uploadedDocs = Array.isArray(a.fields?._uploadedDocuments) ? a.fields._uploadedDocuments : [];
      const uploads = await Promise.all(
        uploadedDocs.map(async (doc) => {
          const { data: signed } = await supabase.storage
            .from('client-documents')
            .createSignedUrl(doc.path, 60 * 10);
          return { filename: doc.filename, downloadUrl: signed?.signedUrl ?? null, uploadedAt: doc.uploadedAt ?? null };
        })
      );

      return {
        id: a.id,
        docType: a.doc_type,
        docLabel: DOC_LABELS[a.doc_type] ?? a.doc_type,
        status: a.status,
        entityName: a.entities?.name,
        locationCode: a.entities?.location_code,
        clientCompanyName: a.clients?.company_name,
        clientEmail: a.clients?.email,
        sentAt: a.sent_at,
        completedAt: a.completed_at,
        createdAt: a.created_at,
        downloadUrl,
        uploads,
      };
    })
  );

  return NextResponse.json({ ok: true, agreements: withUrls });
}
