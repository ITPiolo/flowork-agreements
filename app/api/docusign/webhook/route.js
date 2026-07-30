import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getEnvelopesApi } from '@/lib/docusign';

// POST /api/docusign/webhook — DocuSign Connect delivery target.
// The incoming payload is only used to learn *which* envelope changed; the actual status and
// documents are always re-fetched from DocuSign's API afterward, so a forged/stale payload can't
// mark something completed or plant fake signed documents.
export async function POST(request) {
  const rawBody = await request.text();

  if (process.env.DOCUSIGN_CONNECT_HMAC_KEY) {
    const signature = request.headers.get('x-docusign-signature-1');
    if (!signature || !verifyHmac(rawBody, signature, process.env.DOCUSIGN_CONNECT_HMAC_KEY)) {
      return NextResponse.json({ ok: false, error: 'Invalid Connect signature' }, { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const envelopeId = payload?.data?.envelopeId || payload?.envelopeId;
  if (!envelopeId) {
    return NextResponse.json({ ok: false, error: 'No envelopeId in payload' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .select('*')
    .eq('docusign_envelope_id', envelopeId)
    .single();
  if (agreementError || !agreement) {
    // Not one of ours (or a retry after we've already deleted test data) — ack so DocuSign stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { envelopesApi, accountId } = await getEnvelopesApi();
  const envelope = await envelopesApi.getEnvelope(accountId, envelopeId);

  if (envelope.status !== 'completed') {
    // Any other status (sent, delivered, declined, voided) — just record it, nothing to download yet.
    await supabase
      .from('agreements')
      .update({ status: envelope.status })
      .eq('id', agreement.id);
    return NextResponse.json({ ok: true, status: envelope.status });
  }

  const signedPdf = await envelopesApi.getDocument(accountId, envelopeId, 'combined');
  const storagePath = `${agreement.entity_id}/${agreement.id}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('signed-agreements')
    .upload(storagePath, signedPdf, { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('agreements')
    .update({
      status: 'completed',
      signed_pdf_url: storagePath,
      completed_at: new Date().toISOString(),
    })
    .eq('id', agreement.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agreementId: agreement.id, storagePath });
}

function verifyHmac(rawBody, signatureHeader, key) {
  const expected = crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
