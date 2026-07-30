import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getEnvelopesApi } from '@/lib/docusign';
import { renderHtmlToPdf } from '@/lib/pdf';

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

  const { envelopesApi, accountId } = await getEnvelopesApi();

  const results = [];
  for (const template of templates) {
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('document-templates')
        .download(template.storage_path);
      if (downloadError) throw new Error(`Template download failed: ${downloadError.message}`);

      const html = await fileData.text();
      // Templates render a "Signature:" / "Signature & Company stamp" label but carry no text
      // DocuSign can anchor a tab to, so one is injected into the rendered DOM (see lib/pdf.js).
      const pdfBuffer = await renderHtmlToPdf(html, {
        anchorText: '/sig/',
        anchorAfterPattern: /^Signature/,
      });
      const documentBase64 = pdfBuffer.toString('base64');

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
              tabs: {
                signHereTabs: [
                  {
                    anchorString: '/sig/',
                    anchorUnits: 'pixels',
                    anchorXOffset: '0',
                    anchorYOffset: '0',
                  },
                ],
              },
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
