import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getEnvelopesApi } from '@/lib/docusign';
import { sendCompletionNotificationEmail } from '@/lib/email';

const DOC_TYPE_LABELS = { kyc: 'KYC Form', house_rules: 'House Rules' };

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
    .select('*, entities(name, location_code), clients(company_name, contact_name)')
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

  // Best-effort: a notification failure shouldn't fail the webhook (DocuSign would retry
  // delivery, re-downloading and re-uploading the same signed PDF unnecessarily).
  try {
    const uploadedDocuments = agreement.fields?._uploadedDocuments || [];
    const attachments = [];
    for (const doc of uploadedDocuments) {
      const { data: fileData, error: dlError } = await supabase.storage
        .from('client-documents')
        .download(doc.path);
      if (dlError || !fileData) continue;
      attachments.push({ filename: doc.filename, content: Buffer.from(await fileData.arrayBuffer()) });
    }

    await sendCompletionNotificationEmail({
      locationCode: agreement.entities?.location_code,
      entityName: agreement.entities?.name,
      docTypeLabel: DOC_TYPE_LABELS[agreement.doc_type] || agreement.doc_type,
      clientCompanyName: agreement.clients?.company_name,
      clientContactName: agreement.clients?.contact_name,
      signedPdfBuffer: Buffer.from(signedPdf),
      signedPdfFilename: `${DOC_TYPE_LABELS[agreement.doc_type] || agreement.doc_type} - ${agreement.clients?.company_name || 'signed'}.pdf`,
      attachments,
    });
  } catch (err) {
    console.error('Completion notification email failed:', err.message || err);
  }

  return NextResponse.json({ ok: true, agreementId: agreement.id, storagePath });
}

function verifyHmac(rawBody, signatureHeader, key) {
  const expected = crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
