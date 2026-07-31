import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getEnvelopesApi, getEmbeddedSigningUrl } from '@/lib/docusign';
import { renderFilledPdf } from '@/lib/pdf';
import { getFieldsForDocType } from '@/lib/docusignFields';
import { KYC_FORM_SECTIONS } from '@/lib/kycFormSchema';

// Flattens the web form's values (text answers, radio yes/no, checkbox groups) into the same
// flat { fieldId: value } shape renderFilledPdf expects, matching KYC_FIELDS ids.
function normalizeValues(rawValues) {
  const values = {};
  for (const section of KYC_FORM_SECTIONS) {
    for (const field of section.fields) {
      if (field.type === 'text') {
        values[field.id] = rawValues[field.id] ?? '';
      } else if (field.type === 'radio') {
        const picked = rawValues[field.id]; // 'yes' | 'no' | undefined
        values[field.yesId] = picked === 'yes';
        values[field.noId] = picked === 'no';
      } else if (field.type === 'checkboxGroup') {
        for (const opt of field.options) {
          values[opt.id] = !!rawValues[opt.id];
        }
      }
    }
  }
  return values;
}

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

  const values = normalizeValues(body.values || {});
  const uploadedDocuments = Array.isArray(body.uploadedDocuments) ? body.uploadedDocuments : [];

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('document-templates')
    .download(agreement.document_templates.storage_path);
  if (downloadError) {
    return NextResponse.json({ ok: false, error: `Template download failed: ${downloadError.message}` }, { status: 500 });
  }
  const html = await fileData.text();

  const kycFields = getFieldsForDocType('kyc');
  const signatureField = kycFields.find((f) => f.tab.type === 'sign');
  // The date next to the signature is filled in by DocuSign automatically when the client
  // signs (dateSignedTabs below) — it's not something the web form asks the client to type.
  const dateField = kycFields.find((f) => f.id === 'signer_date');
  const dataFields = kycFields.filter((f) => f.tab.type !== 'sign' && f.id !== 'signer_date');

  let pdfBuffer;
  try {
    ({ pdfBuffer } = await renderFilledPdf(html, dataFields, values, { signatureField, dateField }));
  } catch (err) {
    return NextResponse.json({ ok: false, error: `PDF generation failed: ${err.message}` }, { status: 500 });
  }

  const clientUserId = agreement.clients.email;
  const { envelopesApi, accountId } = await getEnvelopesApi();

  let envelopeSummary;
  try {
    envelopeSummary = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition: {
        emailSubject: `${agreement.entities.name} — KYC Form for signature`,
        documents: [
          {
            documentBase64: pdfBuffer.toString('base64'),
            name: `KYC Form - ${agreement.clients.company_name}.pdf`,
            fileExtension: 'pdf',
            documentId: '1',
          },
        ],
        recipients: {
          signers: [
            {
              email: agreement.clients.email,
              name: agreement.clients.contact_name || agreement.clients.company_name,
              recipientId: '1',
              routingOrder: '1',
              clientUserId,
              tabs: {
                signHereTabs: [
                  { anchorString: signatureField.id, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
                ],
                dateSignedTabs: [
                  { anchorString: dateField.id, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
                ],
              },
            },
          ],
        },
        status: 'sent',
      },
    });
  } catch (err) {
    const detail = err?.response?.body || err?.response?.text || err.message || String(err);
    return NextResponse.json({ ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let signingUrl;
  try {
    signingUrl = await getEmbeddedSigningUrl({
      envelopesApi,
      accountId,
      envelopeId: envelopeSummary.envelopeId,
      signerEmail: agreement.clients.email,
      signerName: agreement.clients.contact_name || agreement.clients.company_name,
      clientUserId,
      returnUrl: `${origin}/kyc-form/complete`,
    });
  } catch (err) {
    const detail = err?.response?.body || err?.response?.text || err.message || String(err);
    return NextResponse.json({ ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) }, { status: 500 });
  }

  await supabase
    .from('agreements')
    .update({
      status: 'sent',
      docusign_envelope_id: envelopeSummary.envelopeId,
      sent_at: new Date().toISOString(),
      fields: { ...values, _uploadedDocuments: uploadedDocuments },
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, signingUrl });
}
