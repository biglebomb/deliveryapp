import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Reduce a phone/JID to comparable digits in 62-international form. */
function toNumber(s: string): string {
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('0') ? `62${d.slice(1)}` : d;
}

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  sumopodKey: required('SUMOPOD_API_KEY'),
  sumopodBaseUrl: process.env.SUMOPOD_BASE_URL ?? 'https://ai.sumopod.com/v1',
  sumopodModel: process.env.SUMOPOD_MODEL ?? 'deepseek-chat',
  ordersChatJid: process.env.ORDERS_CHAT_JID ?? '',
  pairWindowMs: Number(process.env.PAIR_WINDOW_MS ?? 120000),
  discover: process.env.DISCOVER === '1',
  ackReply: process.env.ACK_REPLY === '1',
  // Only process the owner's own messages/forwards (default on) so the admin controls
  // exactly which messages become orders. Set ONLY_FROM_ME=0 to process anyone in the chat.
  onlyFromMe: process.env.ONLY_FROM_ME !== '0',
  // Allowlist of phone numbers (comma-separated) permitted to create orders / run commands.
  // Use this when the bot runs on a SEPARATE number from your business line: put your
  // business number here. When set, it takes precedence over ONLY_FROM_ME.
  allowedSenders: (process.env.ALLOWED_SENDERS ?? '').split(',').map(toNumber).filter(Boolean)
};
