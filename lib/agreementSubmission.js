import { getEnvelopesApi, getEmbeddedSigningUrl } from '@/lib/docusign';
import { renderFilledPdf } from '@/lib/pdf';
import { getFieldsForDocType, KYC_STAMP_FIELD } from '@/lib/docusignFields';
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
              // Explicit size + a small downward nudge past the anchor point — DocuSign's
              // default tab has no set dimensions, and its rendered UI affordance is tall
              // enough to bleed upward into the "SIGNATURE"/"DATE" label sitting just above
              // the blank line when there's little vertical clearance.
              signHereTabs: [{
                anchorString: signatureField.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '2', width: '50', height: '20', anchorIgnoreIfNotPresent: 'false',
              }],
              dateSignedTabs: [{
                anchorString: dateField.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '2', width: '120', height: '16', anchorIgnoreIfNotPresent: 'false',
              }],
              // Required regardless of whether the client already uploaded a stamp on our own
              // web form (that one, if provided, is already composited directly into the
              // COMPANY STAMP box above) — DocuSign can't place a signer-uploaded attachment
              // inside that box itself, so this becomes an extra page appended to the signed
              // document, not a second copy inside the same box.
              signerAttachmentTabs: [{
                anchorString: KYC_STAMP_FIELD.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '100', width: '140', height: '20', anchorIgnoreIfNotPresent: 'false',
                tabLabel: 'Company Stamp', required: 'true',
              }],
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

// House Rules: signature and date anchor to the blank line below their label (no value
// written — DocuSign renders its own tab there), and company name is a real, typed DocuSign
// text tab too — pre-filled with what the client already gave us, but editable, rather than
// baked directly into the page. All three tabs get an explicit size and a downward nudge past
// their anchor point: DocuSign's default tab has no set dimensions, and its rendered UI
// affordance is tall enough to bleed upward into the label sitting just above the blank line
// when there's little vertical clearance, which is what caused the Sign button to visually
// cover the "Signature:" label.
export async function submitHouseRulesAgreement({ supabase, agreement, entity, client, templateStoragePath, origin, returnPath }) {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('document-templates')
    .download(templateStoragePath);
  if (downloadError) {
    throw new Error(`Template download failed: ${downloadError.message}`);
  }
  const html = await fileData.text();

  const fields = getFieldsForDocType('house_rules');
  const signatureField = fields.find((f) => f.tab.type === 'sign');
  const dateField = fields.find((f) => f.id === 'house_rules_date');
  const companyNameField = fields.find((f) => f.id === 'house_rules_company_name');

  const { pdfBuffer } = await renderFilledPdf(html, [], {}, {
    signatureField,
    dateField,
    extraAnchorFields: [companyNameField],
  });

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
            tabs: {
              signHereTabs: [{
                anchorString: signatureField.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '2', width: '50', height: '20', anchorIgnoreIfNotPresent: 'false',
              }],
              dateSignedTabs: [{
                anchorString: dateField.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '2', width: '120', height: '16', anchorIgnoreIfNotPresent: 'false',
              }],
              textTabs: [{
                anchorString: companyNameField.id, anchorUnits: 'pixels',
                anchorXOffset: '0', anchorYOffset: '2', width: '150', height: '16', anchorIgnoreIfNotPresent: 'false',
                tabLabel: companyNameField.tab.tabLabel,
                value: client.company_name || '',
                required: 'true',
              }],
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
    })
    .eq('id', agreement.id);

  return { signingUrl, envelopeId: envelopeSummary.envelopeId };
}
