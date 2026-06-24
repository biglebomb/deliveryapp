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

    // Identify the caller from their JWT.
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(url, serviceKey);

    // Caller must be an owner (HQ) or a branch admin (manager).
    const { data: caller } = await admin
      .from('profiles')
      .select('role, branch_id')
      .eq('id', userData.user.id)
      .single();
    if (caller?.role !== 'owner' && caller?.role !== 'admin') {
      return json({ error: 'Not allowed' }, 403);
    }

    const { email, password, name, phone, role: reqRole, branch_id: reqBranch } = await req.json();
    if (!email || !password) return json({ error: 'Email and password are required' }, 400);

    // Owner may create drivers or branch managers (admins) for any branch.
    // A branch manager may only create drivers, and only for their own branch.
    let role = 'driver';
    let branch_id = caller.branch_id;
    if (caller.role === 'owner') {
      role = reqRole === 'admin' ? 'admin' : 'driver';
      branch_id = reqBranch ?? caller.branch_id;
    }
    if (!branch_id) return json({ error: 'A branch is required' }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? 'Could not create user' }, 400);

    // The on_auth_user_created trigger inserts a default profile; set the details.
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: created.user.id,
      name: name ?? email,
      role,
      branch_id,
      phone: phone ?? null,
      is_active: true
    });
    if (profileErr) return json({ error: profileErr.message }, 400);

    return json({ id: created.user.id, email, role, branch_id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
