import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

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

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { user, error } = await requireAdmin(supabase);
  if (error) return error;

  const { data: target } = await supabase.from('staff_members').select('email').eq('id', id).single();
  if (target?.email === user.email) {
    return NextResponse.json({ ok: false, error: "You can't remove your own access." }, { status: 400 });
  }

  const { error: deleteError } = await supabase.from('staff_members').delete().eq('id', id);
  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
