import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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
  ackReply: process.env.ACK_REPLY === '1'
};
