import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const ALLOWED_DOC_TYPES = ['kyc', 'house_rules'];

// GET /api/public/[location]/[docType] — entity/template info for a public, reusable self-
// service link (e.g. embedded in Flowork's own marketing mailer). Unlike /api/kyc-form/[id],
// there's no agreement yet at this point — this is the entry point *before* one exists.
export async function GET(request, { params }) {
  const { location, docType } = await params;
  if (!ALLOWED_DOC_TYPES.includes(docType)) {
    return NextResponse.json({ ok: false, error: 'Unknown document type' }, { status: 404 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('id, name, location_code, address, phone, email')
    .eq('location_code', location.toUpperCase())
    .single();
  if (entityError || !entity) {
    return NextResponse.json({ ok: false, error: 'Unknown location' }, { status: 404 });
  }

  const { data: template, error: templateError } = await supabase
    .from('document_templates')
    .select('id, storage_path')
    .eq('entity_id', entity.id)
    .eq('doc_type', docType)
    .eq('is_active', true)
    .single();
  if (templateError || !template) {
    return NextResponse.json({ ok: false, error: 'This document is not available for this location' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    entityId: entity.id,
    entityName: entity.name,
    locationCode: entity.location_code,
  });
}
