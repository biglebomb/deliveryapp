// Tenant-isolation test for the org-scoped RLS (Phase 2).
//
// Seeds two organizations with a user + branch + customer each, signs in as each
// real user, and asserts that neither can see or touch the other's data — and
// that an unauthenticated client sees nothing.
//
// Run against a local stack:
//   supabase start
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node tests/rls-isolation.test.mjs
// (npm run test:isolation wires the env from `supabase status`.)

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!SERVICE || !ANON) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (see `supabase status`).');
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
}

async function signIn(email, password) {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function seedOrg(label) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `${label}_${suffix}@test.local`;
  const password = 'password123!';

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `Org ${label} ${suffix}` })
    .select()
    .single();
  if (orgErr) throw new Error(`create org: ${orgErr.message}`);

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (userErr) throw new Error(`create user: ${userErr.message}`);
  const userId = created.user.id;

  // The auth trigger creates a profile (stamped to the seed org by default) — point it at this org.
  const { error: profErr } = await admin
    .from('profiles')
    .upsert({ id: userId, name: `Owner ${label}`, role: 'owner', org_id: org.id });
  if (profErr) throw new Error(`set profile org: ${profErr.message}`);

  const { data: branch, error: brErr } = await admin
    .from('branches')
    .insert({ name: `Branch ${label}`, org_id: org.id })
    .select()
    .single();
  if (brErr) throw new Error(`create branch: ${brErr.message}`);

  const { data: customer, error: custErr } = await admin
    .from('customers')
    .insert({ name: `Customer ${label}`, org_id: org.id, branch_id: branch.id })
    .select()
    .single();
  if (custErr) throw new Error(`create customer: ${custErr.message}`);

  return { org, userId, email, password, branch, customer };
}

async function main() {
  let a, b;
  try {
    a = await seedOrg('a');
    b = await seedOrg('b');

    const clientA = await signIn(a.email, a.password);
    const clientB = await signIn(b.email, b.password);

    // 1. Each user sees only their own org's customers.
    const { data: aCustomers } = await clientA.from('customers').select('id, org_id');
    check('A sees exactly its own customer', aCustomers?.length === 1 && aCustomers[0].org_id === a.org.id);

    const { data: bCustomers } = await clientB.from('customers').select('id, org_id');
    check('B sees exactly its own customer', bCustomers?.length === 1 && bCustomers[0].org_id === b.org.id);

    // 2. A cannot read B's customer by id (RLS hides it).
    const { data: leak } = await clientA.from('customers').select('id').eq('id', b.customer.id);
    check("A cannot read B's customer by id", (leak?.length ?? 0) === 0);

    // 3. A cannot update B's customer (0 rows affected, no error).
    const { data: updated } = await clientA
      .from('customers')
      .update({ name: 'hijacked' })
      .eq('id', b.customer.id)
      .select();
    check("A cannot update B's customer", (updated?.length ?? 0) === 0);

    // 4. A cannot insert a row into B's org (with-check rejects the foreign org_id).
    const { error: insErr } = await clientA
      .from('customers')
      .insert({ name: 'intruder', org_id: b.org.id, branch_id: b.branch.id });
    check("A cannot insert into B's org", Boolean(insErr));

    // 5. A only sees its own org row in organizations.
    const { data: orgsSeenByA } = await clientA.from('organizations').select('id');
    check('A sees only its own organization', orgsSeenByA?.length === 1 && orgsSeenByA[0].id === a.org.id);

    // 6. Anonymous (no auth) sees no customers.
    const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: anonCustomers } = await anon.from('customers').select('id');
    check('Anonymous sees no customers', (anonCustomers?.length ?? 0) === 0);
  } finally {
    // Cleanup (service role; order respects FKs).
    for (const seed of [a, b]) {
      if (!seed) continue;
      await admin.from('customers').delete().eq('org_id', seed.org.id);
      await admin.from('branches').delete().eq('org_id', seed.org.id);
      await admin.auth.admin.deleteUser(seed.userId).catch(() => {});
      await admin.from('organizations').delete().eq('id', seed.org.id);
    }
  }

  console.log(failures === 0 ? '\nAll isolation checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test error:', err.message);
  process.exit(2);
});
