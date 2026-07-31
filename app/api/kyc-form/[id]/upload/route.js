import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// POST /api/kyc-form/[id]/upload — one call per attached document. Public (unauthenticated),
// same as the rest of the kyc-form flow: scoped to a single unguessable agreement id, and only
// accepted while that agreement is still in 'draft' (awaiting the client's submission).
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .select('id, status, doc_type')
    .eq('id', id)
    .eq('doc_type', 'kyc')
    .single();
  if (agreementError || !agreement) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  if (agreement.status !== 'draft') {
    return NextResponse.json({ ok: false, error: 'This form is no longer accepting uploads.' }, { status: 409 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const docId = formData.get('docId');
  if (!file || !docId) {
    return NextResponse.json({ ok: false, error: 'file and docId are required' }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, error: 'File is too large (10MB max)' }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${id}/${docId}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('client-documents')
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path: storagePath, filename: file.name, uploadedAt: new Date().toISOString() });
}
