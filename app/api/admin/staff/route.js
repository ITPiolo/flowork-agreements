import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// Only staff with entity_id IS NULL (access to every entity) can manage other staff — same
// bar as "can see everything" already implies "can decide who else sees everything".
async function requireAdmin(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 }) };

  const { data: me } = await supabase
    .from('staff_members')
    .select('entity_id')
    .eq('email', user.email)
    .maybeSingle();
  if (!me || me.entity_id !== null) {
    return { error: NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { error } = await requireAdmin(supabase);
  if (error) return error;

  const { data: staff, error: listError } = await supabase
    .from('staff_members')
    .select('id, email, entity_id, created_at, entities(name, location_code)')
    .order('created_at', { ascending: false });
  if (listError) {
    return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    staff: staff.map((s) => ({
      id: s.id,
      email: s.email,
      entityId: s.entity_id,
      locationCode: s.entities?.location_code ?? null,
      createdAt: s.created_at,
    })),
  });
}

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { error } = await requireAdmin(supabase);
  if (error) return error;

  const body = await request.json();
  const email = (body.email || '').trim().toLowerCase();
  const entityId = body.entityId || null; // null = access to all entities

  if (!email.endsWith('@flowork.me')) {
    return NextResponse.json({ ok: false, error: 'Email must be an @flowork.me address' }, { status: 400 });
  }

  const { data, error: insertError } = await supabase
    .from('staff_members')
    .insert({ email, entity_id: entityId })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: data });
}
