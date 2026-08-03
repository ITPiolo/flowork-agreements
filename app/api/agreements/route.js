import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getEnvelopesApi } from '@/lib/docusign';
import { renderFilledPdf } from '@/lib/pdf';
import { getFieldsForDocType } from '@/lib/docusignFields';
import { sendKycFormEmail } from '@/lib/email';

const DOC_LABELS = { house_rules: 'House Rules', kyc: 'KYC Form' };

export async function POST(request) {
  const body = await request.json();
  const { entityId, docTypes, client } = body;

  if (!entityId || !Array.isArray(docTypes) || docTypes.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'entityId and at least one docType are required' },
      { status: 400 }
    );
  }
  if (!client?.companyName || !client?.email) {
    return NextResponse.json(
      { ok: false, error: 'client.companyName and client.email are required' },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Look up the entity so branding/address always comes from the DB, never the client request.
  // RLS (staff_members) means this returns nothing if the signed-in staff member isn't scoped
  // to this entity — e.g. operations.dubaihills@flowork.me requesting entityId=VT.
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single();
  if (entityError || !entity) {
    return NextResponse.json({ ok: false, error: 'Unknown entity or not permitted' }, { status: 403 });
  }

  // Templates are scoped to this entity only — this is what prevents DH/VT cross-branding.
  const { data: templates, error: templatesError } = await supabase
    .from('document_templates')
    .select('*')
    .eq('entity_id', entityId)
    .in('doc_type', docTypes)
    .eq('is_active', true);
  if (templatesError || !templates || templates.length !== docTypes.length) {
    return NextResponse.json(
      { ok: false, error: 'One or more requested document templates were not found for this entity' },
      { status: 400 }
    );
  }

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .insert({
      company_name: client.companyName,
      contact_name: client.contactName ?? null,
      email: client.email,
      phone: client.phone ?? null,
      trade_licence_no: client.tradeLicenceNo ?? null,
      office_no: client.officeNo ?? null,
      entity_id: entityId,
    })
    .select()
    .single();
  if (clientError) {
    return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  const results = [];
  for (const template of templates) {
    try {
      if (template.doc_type === 'kyc') {
        // KYC is filled out by the client on our own web form (DocuSign's anchor-based tab
        // placement proved too unreliable for a ~60-field form), then redirected straight into
        // DocuSign for just the signature. See app/kyc-form/[id].
        const { data: agreement, error: agreementError } = await supabase
          .from('agreements')
          .insert({
            client_id: clientRow.id,
            entity_id: entityId,
            template_id: template.id,
            doc_type: template.doc_type,
            status: 'draft',
          })
          .select()
          .single();
        if (agreementError) throw new Error(agreementError.message);

        const formUrl = `${origin}/kyc-form/${agreement.id}`;
        await sendKycFormEmail({
          locationCode: entity.location_code,
          entityName: entity.name,
          clientEmail: client.email,
          clientContactName: client.contactName,
          formUrl,
        });

        results.push({ docType: template.doc_type, agreementId: agreement.id, kycFormEmailed: true });
        continue;
      }

      // Non-KYC documents (currently just House Rules): no client data entry needed, so the
      // existing DocuSign anchor-based signature flow sends it immediately.
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('document-templates')
        .download(template.storage_path);
      if (downloadError) throw new Error(`Template download failed: ${downloadError.message}`);

      const html = await fileData.text();
      const fields = getFieldsForDocType(template.doc_type);
      const signatureField = fields.find((f) => f.tab.type === 'sign');
      const dateField = fields.find((f) => f.id === 'house_rules_date');
      const companyNameField = fields.find((f) => f.id === 'house_rules_company_name');

      const { pdfBuffer } = await renderFilledPdf(html, [], {}, {
        signatureField,
        dateField,
        extraAnchorFields: [companyNameField],
      });
      const documentBase64 = pdfBuffer.toString('base64');
      // Explicit size + a small downward nudge past the anchor point — DocuSign's default tab
      // has no set dimensions, and its rendered UI affordance is tall enough to bleed upward
      // into the label sitting just above the blank line when there's little clearance.
      const tabs = {
        signHereTabs: [{
          anchorString: signatureField.id, anchorUnits: 'pixels',
          anchorXOffset: '4', anchorYOffset: '0', width: '50', height: '16', anchorIgnoreIfNotPresent: 'false',
        }],
        dateSignedTabs: [{
          anchorString: dateField.id, anchorUnits: 'pixels',
          anchorXOffset: '0', anchorYOffset: '-14', width: '120', height: '16', anchorIgnoreIfNotPresent: 'false',
        }],
        textTabs: [{
          anchorString: companyNameField.id, anchorUnits: 'pixels',
          anchorXOffset: '0', anchorYOffset: '-14', width: '150', height: '16', anchorIgnoreIfNotPresent: 'false',
          tabLabel: companyNameField.tab.tabLabel,
          value: client.companyName || '',
          required: 'true',
        }],
      };

      const { envelopesApi, accountId } = await getEnvelopesApi();

      const envelopeDefinition = {
        emailSubject: `${entity.name} — ${DOC_LABELS[template.doc_type] ?? template.name} for signature`,
        documents: [
          {
            documentBase64,
            name: `${template.name} - ${client.companyName}.pdf`,
            fileExtension: 'pdf',
            documentId: '1',
          },
        ],
        recipients: {
          signers: [
            {
              email: client.email,
              name: client.contactName || client.companyName,
              recipientId: '1',
              routingOrder: '1',
              tabs,
            },
          ],
        },
        status: 'sent',
      };

      const envelopeSummary = await envelopesApi.createEnvelope(accountId, {
        envelopeDefinition,
      });

      const { data: agreement, error: agreementError } = await supabase
        .from('agreements')
        .insert({
          client_id: clientRow.id,
          entity_id: entityId,
          template_id: template.id,
          doc_type: template.doc_type,
          docusign_envelope_id: envelopeSummary.envelopeId,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (agreementError) throw new Error(agreementError.message);

      results.push({ docType: template.doc_type, envelopeId: envelopeSummary.envelopeId, agreementId: agreement.id });
    } catch (err) {
      console.error('agreement creation failed', template.doc_type, err?.response?.body, err?.response?.text, err);
      const detail = err?.response?.body || err?.response?.text || err.message || String(err);
      results.push({
        docType: template.doc_type,
        error: typeof detail === 'string' ? detail : JSON.stringify(detail),
      });
    }
  }

  const anyFailed = results.some((r) => r.error);
  return NextResponse.json(
    { ok: !anyFailed, clientId: clientRow.id, results },
    { status: anyFailed ? 207 : 200 }
  );
}
