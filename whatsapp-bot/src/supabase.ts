import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './config';

// Service-role client (server-side only) — bypasses RLS to read products and write the inbox.
// Node 20 has no global WebSocket; supabase-js still inits its realtime client, so hand it `ws`.
export const supabase = createClient(config.supabaseUrl, config.serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket }
});
