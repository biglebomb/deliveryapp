import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(url, serviceKey);

    const { data: caller } = await admin
      .from('profiles')
      .select('role, branch_id')
      .eq('id', userData.user.id)
      .single();
    if (caller?.role !== 'owner' && caller?.role !== 'admin') {
      return json({ error: 'Not allowed' }, 403);
    }

    const { id } = await req.json();
    if (!id) return json({ error: 'A member id is required' }, 400);
    if (id === userData.user.id) return json({ error: 'You cannot delete your own account' }, 400);

    const { data: target } = await admin
      .from('profiles')
      .select('role, branch_id')
      .eq('id', id)
      .single();
    if (!target) return json({ error: 'Member not found' }, 404);
    if (target.role === 'owner') return json({ error: 'Owners cannot be deleted' }, 403);

    // A branch manager may only remove drivers in their own branch.
    if (caller.role === 'admin') {
      if (target.role !== 'driver') return json({ error: 'Managers can only remove drivers' }, 403);
      if (target.branch_id !== caller.branch_id) return json({ error: 'That member is in another branch' }, 403);
    }

    // Deleting the auth user cascades the profile; orders keep their history
    // (assigned_driver_id is ON DELETE SET NULL).
    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
