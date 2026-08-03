import { getEnvelopesApi, getEmbeddedSigningUrl } from '@/lib/docusign';
import { renderFilledPdf, renderHtmlToPdf } from '@/lib/pdf';
import { getFieldsForDocType, buildSignerTabs, KYC_STAMP_FIELD } from '@/lib/docusignFields';
import { KYC_FORM_SECTIONS } from '@/lib/kycFormSchema';

// Flattens the web form's values (text answers, radio yes/no, checkbox groups) into the same
// flat { fieldId: value } shape renderFilledPdf expects, matching KYC_FIELDS ids.
export function normalizeKycValues(rawValues) {
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

// Fills the KYC PDF with the client's answers, creates a DocuSign envelope (signature + auto
// date only — everything else is already baked into the PDF as real content), marks the
// agreement 'sent', and returns an embedded signing URL. Shared by both the staff-initiated
// flow (agreement pre-created, client fills a link staff generated) and the public self-service
// links Abdullah's marketing mailer uses (client is their own "clientRow", agreement created at
// submission time) — the fill/envelope logic is identical either way.
export async function submitKycAgreement({ supabase, agreement, entity, client, templateStoragePath, rawValues, uploadedDocuments, stampDocumentPath, origin, returnPath }) {
  const values = normalizeKycValues(rawValues || {});

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('document-templates')
    .download(templateStoragePath);
  if (downloadError) {
    throw new Error(`Template download failed: ${downloadError.message}`);
  }
  const html = await fileData.text();

  const kycFields = getFieldsForDocType('kyc');
  const signatureField = kycFields.find((f) => f.tab.type === 'sign');
  const dateField = kycFields.find((f) => f.id === 'signer_date');
  const dataFields = kycFields.filter((f) => f.tab.type !== 'sign' && f.id !== 'signer_date');

  let stampImageDataUrl = null;
  if (stampDocumentPath) {
    const { data: stampFile, error: stampError } = await supabase.storage
      .from('client-documents')
      .download(stampDocumentPath);
    if (stampError) {
      throw new Error(`Company stamp download failed: ${stampError.message}`);
    }
    const contentType = stampFile.type || 'image/png';
    const base64 = Buffer.from(await stampFile.arrayBuffer()).toString('base64');
    stampImageDataUrl = `data:${contentType};base64,${base64}`;
  }

  const { pdfBuffer } = await renderFilledPdf(html, dataFields, values, {
    signatureField,
    dateField,
    stampField: KYC_STAMP_FIELD,
    stampImageDataUrl,
  });

  const clientUserId = client.email;
  const { envelopesApi, accountId } = await getEnvelopesApi();

  const envelopeSummary = await envelopesApi.createEnvelope(accountId, {
    envelopeDefinition: {
      emailSubject: `${entity.name} — KYC Form for signature`,
      documents: [
        { documentBase64: pdfBuffer.toString('base64'), name: `KYC Form - ${client.company_name}.pdf`, fileExtension: 'pdf', documentId: '1' },
      ],
      recipients: {
        signers: [
          {
            email: client.email,
            name: client.contact_name || client.company_name,
            recipientId: '1',
            routingOrder: '1',
            clientUserId,
            tabs: {
              signHereTabs: [{ anchorString: signatureField.id, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }],
              dateSignedTabs: [{ anchorString: dateField.id, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }],
            },
          },
        ],
      },
      status: 'sent',
    },
  });

  const signingUrl = await getEmbeddedSigningUrl({
    envelopesApi,
    accountId,
    envelopeId: envelopeSummary.envelopeId,
    signerEmail: client.email,
    signerName: client.contact_name || client.company_name,
    clientUserId,
    returnUrl: `${origin}${returnPath || '/kyc-form/complete'}`,
  });

  await supabase
    .from('agreements')
    .update({
      status: 'sent',
      docusign_envelope_id: envelopeSummary.envelopeId,
      sent_at: new Date().toISOString(),
      fields: { ...values, _uploadedDocuments: uploadedDocuments || [] },
    })
    .eq('id', agreement.id);

  return { signingUrl, envelopeId: envelopeSummary.envelopeId };
}

// House Rules has no client data entry — just a signature (DocuSign anchor-based placement is
// reliable for a single tab, unlike the ~60-field KYC form). Creates the envelope directly and
// returns an embedded signing URL.
export async function submitHouseRulesAgreement({ supabase, agreement, entity, client, templateStoragePath, origin, returnPath }) {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('document-templates')
    .download(templateStoragePath);
  if (downloadError) {
    throw new Error(`Template download failed: ${downloadError.message}`);
  }
  const html = await fileData.text();

  const fields = getFieldsForDocType('house_rules');
  const { pdfBuffer, placements } = await renderHtmlToPdf(html, { anchors: fields });
  const tabs = buildSignerTabs(fields, placements);

  const clientUserId = client.email;
  const { envelopesApi, accountId } = await getEnvelopesApi();

  const envelopeSummary = await envelopesApi.createEnvelope(accountId, {
    envelopeDefinition: {
      emailSubject: `${entity.name} — House Rules for signature`,
      documents: [
        { documentBase64: pdfBuffer.toString('base64'), name: `House Rules - ${client.company_name}.pdf`, fileExtension: 'pdf', documentId: '1' },
      ],
      recipients: {
        signers: [
          {
            email: client.email,
            name: client.contact_name || client.company_name,
            recipientId: '1',
            routingOrder: '1',
            clientUserId,
            tabs,
          },
        ],
      },
      status: 'sent',
    },
  });

  const signingUrl = await getEmbeddedSigningUrl({
    envelopesApi,
    accountId,
    envelopeId: envelopeSummary.envelopeId,
    signerEmail: client.email,
    signerName: client.contact_name || client.company_name,
    clientUserId,
    returnUrl: `${origin}${returnPath || '/kyc-form/complete'}`,
  });

  await supabase
    .from('agreements')
    .update({
      status: 'sent',
      docusign_envelope_id: envelopeSummary.envelopeId,
      sent_at: new Date().toISOString(),
    })
    .eq('id', agreement.id);

  return { signingUrl, envelopeId: envelopeSummary.envelopeId };
}
