import OpenAI from 'openai';
import { config } from './config';
import { supabase } from './supabase';

const client = new OpenAI({ apiKey: config.sumopodKey, baseURL: config.sumopodBaseUrl });

export interface ParsedItem {
  name: string;
  quantity: number;
  product_id: string | null;
}

export interface ParsedOrder {
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  items: ParsedItem[];
  notes: string | null;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

function normalizePhone(phone: unknown): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

/**
 * Parse a free-text Indonesian WhatsApp order into structured data, and let the
 * model map each line to a product id from the live catalog (handles abbreviations
 * like "ori" -> "Original"). Unmatched lines come back with product_id null for the
 * admin to map in the review inbox.
 */
export async function parseOrder(text: string): Promise<ParsedOrder> {
  const { data } = await supabase.from('products').select('id, name').eq('is_active', true);
  const products = data ?? [];
  const validIds = new Set(products.map((p) => p.id as string));
  const catalog = products.map((p) => `${p.id} = ${p.name}`).join('\n') || '(no products)';

  const system = `You extract a delivery order from an Indonesian WhatsApp message.

Available products (format "id = name"):
${catalog}

Return ONLY a JSON object, no markdown:
{"customer_name": string|null, "phone": string|null, "address": string|null, "items": [{"name": string, "quantity": number, "product_id": string|null}], "notes": string|null}

Rules:
- "name" is the item as written by the customer (e.g. "susu ori 1 liter").
- "product_id" is the best-matching product id from the list above (match Indonesian abbreviations, e.g. "ori" = "Original"), or null if you are unsure.
- "quantity" is an integer (default 1).
- "address" is the delivery address / location description, with filler words removed (e.g. from "alamat lengkap diantar ke Blok E2/1" extract "Blok E2/1"; also streets, RT/RW, building/block names). null if none given.
- "notes" is any OTHER delivery instruction that is not the address (e.g. "titip satpam", "rumah pagar hijau"), else null.`;

  const res = await client.chat.completions.create({
    model: config.sumopodModel,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ]
  });

  const content = res.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(extractJson(content)) as Partial<ParsedOrder>;

  const items: ParsedItem[] = Array.isArray(parsed.items)
    ? parsed.items
        .map((it) => ({
          name: String(it?.name ?? '').trim(),
          quantity: Math.max(1, Math.round(Number(it?.quantity)) || 1),
          product_id: it?.product_id && validIds.has(it.product_id) ? it.product_id : null
        }))
        .filter((it) => it.name)
    : [];

  return {
    customer_name: parsed.customer_name?.trim() || null,
    phone: normalizePhone(parsed.phone),
    address: parsed.address?.trim() || null,
    items,
    notes: parsed.notes?.trim() || null
  };
}
