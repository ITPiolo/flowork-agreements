import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// GET /api/entities — lists entities with their active document templates.
// Uses the signed-in staff member's session so RLS (staff_members entity scoping) applies:
// operations.dubaihills@flowork.me only ever sees DH, operations.vt@flowork.me only VT.
export async function GET() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

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
