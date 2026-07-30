import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';

// GET /api/entities — lists entities with their active document templates, for the staff form.
// Uses the service client because `entities`/`document_templates` are RLS-locked to `authenticated`
// and this app has no staff login flow yet (see README "Known gaps").
export async function GET() {
  const supabase = getSupabaseServiceClient();

  const { data: entities, error: entitiesError } = await supabase
    .from('entities')
    .select('id, name, location_code, address, phone, email')
    .order('location_code');
  if (entitiesError) {
    return NextResponse.json({ ok: false, error: entitiesError.message }, { status: 500 });
  }

  const { data: templates, error: templatesError } = await supabase
    .from('document_templates')
    .select('id, entity_id, doc_type, name')
    .eq('is_active', true);
  if (templatesError) {
    return NextResponse.json({ ok: false, error: templatesError.message }, { status: 500 });
  }

  const withTemplates = entities.map((entity) => ({
    ...entity,
    templates: templates.filter((t) => t.entity_id === entity.id),
  }));

  return NextResponse.json({ ok: true, entities: withTemplates });
}
