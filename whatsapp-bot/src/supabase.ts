import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Service-role client (server-side only) — bypasses RLS to read products and write the inbox.
export const supabase = createClient(config.supabaseUrl, config.serviceKey, {
  auth: { persistSession: false }
});
