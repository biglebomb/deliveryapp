import qrcode from 'qrcode-terminal';
// whatsapp-web.js is CommonJS — default-import then destructure (named ESM imports fail).
import pkg from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import { config } from './config';

const { Client, LocalAuth } = pkg;
import { extractMapsUrl, resolveMapsLink } from './maps-link';
import { parseOrder, normalizePhone, type ParsedOrder } from './parser';
import { supabase } from './supabase';

type Reply = (text: string) => Promise<void>;

interface Buffer {
  text?: string;
  textTs?: number;
  lat?: number;
  lng?: number;
  locTs?: number;
  timer?: ReturnType<typeof setTimeout>;
  reply?: Reply;
  parsed?: ParsedOrder;
}

// A customer added via /addcustomer, waiting for the owner to send a location next.
interface PendingCustomer {
  id: string;
  name: string;
  ts: number;
  reply?: Reply;
}

const buffers = new Map<string, Buffer>();
const pendingCustomers = new Map<string, PendingCustomer>();
const secs = Math.round(config.pairWindowMs / 1000);

// Our own outgoing replies also fire `message_create` (same account = fromMe), so remember
// what we just sent and skip it, otherwise a confirmation would be parsed as an order.
const recentlySent: { body: string; ts: number }[] = [];
function rememberSent(body: string) {
  recentlySent.push({ body: body.trim(), ts: Date.now() });
}
function wasSentByUs(body: string): boolean {
  const now = Date.now();
  while (recentlySent.length && now - recentlySent[0].ts > 15000) recentlySent.shift();
  return recentlySent.some((s) => s.body === body.trim());
}

// Set when the client is ready; we ignore any message older than this so the
// history WhatsApp replays on initial sync never creates orders.
let readyAt = 0;

async function processOrder(
  sender: string,
  orderText: string,
  lat: number | null,
  lng: number | null,
  reply?: Reply,
  preParsed?: ParsedOrder
) {
  try {
    const parsed = preParsed ?? (await parseOrder(orderText));
    const { error } = await supabase.from('order_inbox').insert({
      raw_text: orderText,
      parsed,
      latitude: lat !== null ? Number(lat.toFixed(6)) : null,
      longitude: lng !== null ? Number(lng.toFixed(6)) : null,
      sender,
      status: 'pending'
    });
    if (error) throw error;
    const where = lat !== null ? 'pin' : 'address only';
    console.log(`✓ Inbox +1 (${where}): ${parsed.customer_name ?? 'order'} — ${parsed.items.length} item(s)`);
    if (config.ackReply && reply) await reply('Pesanan diterima, sedang diproses. 🙏');
  } catch (err) {
    console.error('Failed to process order:', err);
  }
}

// A customer we already know (same name AND same phone) with a saved location — return
// their coords so we can create the order right away, no pin/timeout needed.
async function knownCustomerLocation(parsed: ParsedOrder): Promise<{ lat: number; lng: number } | null> {
  if (!parsed.customer_name || !parsed.phone) return null;
  const name = parsed.customer_name.trim().toLowerCase();
  const { data } = await supabase.from('customers').select('name, phone, latitude, longitude');
  const match = (data ?? []).find(
    (c) =>
      c.latitude !== null &&
      c.longitude !== null &&
      String(c.name ?? '').trim().toLowerCase() === name &&
      normalizePhone(c.phone) === parsed.phone
  );
  return match ? { lat: Number(match.latitude), lng: Number(match.longitude) } : null;
}

// No location pin arrived within the window. Create the order anyway IF an address was
// detected in the text; otherwise drop it and log why.
async function finalizeNoLocation(sender: string) {
  const buf = buffers.get(sender);
  if (!buf?.text) return;
  buffers.delete(sender);
  try {
    const parsed = buf.parsed ?? (await parseOrder(buf.text));
    if (parsed.address) {
      console.log(`· no pin within ${secs}s, but address detected ("${parsed.address}") — creating order…`);
      await processOrder(sender, buf.text, null, null, buf.reply, parsed);
    } else {
      console.log(`✗ Dropped order from ${sender}: no location pin and no address detected after ${secs}s.`);
    }
  } catch (err) {
    console.error('Failed to finalize order without location:', err);
  }
}

// ---- Commands -------------------------------------------------------------

const HELP = [
  '📋 Perintah:',
  '/addcustomer <nama> <nomor> — simpan pelanggan, lalu kirim lokasi (pin/link Maps)',
  '/cancel — batalkan proses berjalan',
  '/help — bantuan',
  '',
  'Teks biasa atau forward tetap otomatis jadi pesanan.'
].join('\n');

/** Reuse an existing customer with the same name + phone, else insert a new one. */
async function upsertCustomer(name: string, phone: string | null): Promise<{ id: string; name: string }> {
  if (phone) {
    const { data } = await supabase.from('customers').select('id, name, phone');
    const match = (data ?? []).find(
      (c) => normalizePhone(c.phone) === phone && String(c.name ?? '').trim().toLowerCase() === name.toLowerCase()
    );
    if (match) return { id: match.id as string, name: match.name as string };
  }
  const { data, error } = await supabase.from('customers').insert({ name, phone }).select('id, name').single();
  if (error) throw error;
  return { id: data.id as string, name: data.name as string };
}

async function addCustomer(sender: string, arg: string, reply: Reply) {
  if (!arg) {
    await reply('Format: /addcustomer <nama> <nomor>\nContoh: /addcustomer Fahruddin +62 878-3831-2663');
    return;
  }
  let name = arg;
  let phoneRaw: string | null = null;
  if (arg.includes('|')) {
    const [n, p] = arg.split('|');
    name = n.trim();
    phoneRaw = p?.trim() ?? null;
  } else {
    const m = arg.match(/(\+?\d[\d\s().-]{5,}\d)/);
    if (m) {
      phoneRaw = m[1];
      name = arg.replace(m[1], '').trim();
    }
  }
  name = name.replace(/[,;]+$/, '').trim() || 'Pelanggan';
  const phone = normalizePhone(phoneRaw);

  try {
    const customer = await upsertCustomer(name, phone);
    pendingCustomers.set(sender, { id: customer.id, name: customer.name, ts: Date.now(), reply });
    console.log(`✓ Customer "${name}"${phone ? ` (${phone})` : ''} saved — waiting ${secs}s for a location…`);
    await reply(
      `✓ Pelanggan "${name}"${phone ? ` / ${phone}` : ''} disimpan.\n` +
        `Kirim lokasi sekarang (pin atau link Maps) dalam ${secs}s untuk menyimpan titik antar.`
    );
  } catch (err) {
    console.error('Failed to add customer:', err);
    await reply('Gagal menyimpan pelanggan.');
  }
}

async function handleCommand(sender: string, raw: string, reply: Reply) {
  const body = raw.slice(1).trim();
  const sp = body.indexOf(' ');
  const cmd = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const arg = sp === -1 ? '' : body.slice(sp + 1).trim();

  switch (cmd) {
    case 'addcustomer':
    case 'add':
      await addCustomer(sender, arg, reply);
      break;
    case 'cancel':
      pendingCustomers.delete(sender);
      buffers.delete(sender);
      console.log(`· cancelled pending state for ${sender}`);
      await reply('Dibatalkan.');
      break;
    case 'help':
    case 'start':
      await reply(HELP);
      break;
    default:
      await reply(`Perintah tidak dikenal: /${cmd}\n\n${HELP}`);
  }
}

/** If a /addcustomer is awaiting a location for this sender, bind it. Returns true if handled. */
async function tryBindPendingCustomer(
  sender: string,
  input: { lat?: number; lng?: number; text?: string | null },
  reply: Reply
): Promise<boolean> {
  const pc = pendingCustomers.get(sender);
  if (!pc) return false;
  if (Date.now() - pc.ts > config.pairWindowMs) {
    pendingCustomers.delete(sender);
    return false;
  }

  let lat = input.lat;
  let lng = input.lng;
  if ((lat === undefined || lng === undefined) && input.text) {
    const url = extractMapsUrl(input.text);
    if (!url) return false; // not a location — let it flow normally, keep waiting
    try {
      const coords = await resolveMapsLink(url);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    } catch (err) {
      console.error('Maps link resolve failed:', err);
    }
  }
  if (lat === undefined || lng === undefined) return false;

  pendingCustomers.delete(sender);
  const { error } = await supabase
    .from('customers')
    .update({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })
    .eq('id', pc.id);
  if (error) {
    console.error('Failed to set customer location:', error);
    await reply('Gagal menyimpan lokasi.');
    return true;
  }
  console.log(`✓ Location saved for customer "${pc.name}".`);
  await reply(`✓ Lokasi tersimpan untuk "${pc.name}". Pelanggan siap dipakai.`);
  return true;
}

// ---- WhatsApp client ------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

client.on('qr', (qr) => {
  console.log('\nScan this QR in WhatsApp → Settings → Linked devices:\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log('Authenticated.'));
client.on('auth_failure', (m) => console.error('Auth failure:', m));
client.on('disconnected', (reason) => console.log('Disconnected:', reason));
client.on('ready', () => {
  readyAt = Date.now();
  console.log('✓ WhatsApp connected.');
  if (config.discover) console.log('DISCOVER mode: send/forward a message in your Orders chat to see its id.');
  else if (!config.ordersChatJid) console.log('⚠ ORDERS_CHAT_JID is empty — listening to ALL chats. Run `npm run discover` to find it.');
});

// `message_create` (not `message`) so we also catch messages YOU send/forward — the bot is
// linked to your own number, so forwards into the Orders chat are "from me".
client.on('message_create', async (msg: Message) => {
  // Only react to messages that arrive after we're ready — skip replayed history.
  // 60s grace so clock skew between this machine and WhatsApp doesn't drop a live message.
  if (readyAt === 0 || msg.timestamp * 1000 < readyAt - 60000) return;

  const chat = msg.from;
  const sender = msg.author ?? msg.from;
  const isLocation = msg.type === 'location';
  const text = !isLocation ? msg.body?.trim() || null : null;
  const loc =
    isLocation && msg.location
      ? { lat: Number(msg.location.latitude), lng: Number(msg.location.longitude) }
      : null;

  // Ignore our own confirmation/ack replies (they're fromMe too).
  if (text && wasSentByUs(text)) return;

  if (config.discover) {
    const preview = loc ? '[location]' : text ? JSON.stringify(text).slice(0, 60) : '[other]';
    console.log(`[discover] chat=${chat} sender=${sender} fromMe=${msg.fromMe} ${preview}`);
    return;
  }

  if (config.ordersChatJid && chat !== config.ordersChatJid) return;
  // Admin control: only the owner's own messages are acted on.
  if (config.onlyFromMe && !msg.fromMe) return;

  const reply: Reply = async (t) => {
    rememberSent(t);
    await msg.reply(t);
  };

  // Slash commands are never treated as orders.
  if (text && text.startsWith('/')) {
    await handleCommand(sender, text, reply);
    return;
  }

  if (!text && !loc) return;

  // A /addcustomer awaiting a location? Bind it instead of starting an order.
  if (await tryBindPendingCustomer(sender, { lat: loc?.lat, lng: loc?.lng, text }, reply)) return;

  const now = Date.now();
  const buf = buffers.get(sender) ?? {};
  buf.reply = reply;
  if (text) {
    buf.text = text;
    buf.textTs = now;
    // If the message contains a Google Maps link and we have no pin yet, resolve it to coords.
    // (A native location pin always takes priority — the loc branch below overrides this.)
    const mapsUrl = extractMapsUrl(text);
    if (mapsUrl && buf.lat === undefined) {
      try {
        const coords = await resolveMapsLink(mapsUrl);
        if (coords) {
          buf.lat = coords.lat;
          buf.lng = coords.lng;
          buf.locTs = now;
          console.log(`· resolved Maps link → ${coords.lat}, ${coords.lng}`);
        }
      } catch (err) {
        console.error('Maps link resolve failed:', err);
      }
    }
  }
  if (loc) {
    buf.lat = loc.lat;
    buf.lng = loc.lng;
    buf.locTs = now;
  }
  buffers.set(sender, buf);

  const fresh = (ts?: number) => ts !== undefined && now - ts <= config.pairWindowMs;
  const haveText = Boolean(buf.text) && fresh(buf.textTs);
  const haveLoc = buf.lat !== undefined && buf.lng !== undefined && fresh(buf.locTs);

  if (haveText && haveLoc) {
    if (buf.timer) clearTimeout(buf.timer);
    buffers.delete(sender);
    console.log(`· paired text + location from ${sender} — creating order…`);
    await processOrder(sender, buf.text as string, buf.lat as number, buf.lng as number, buf.reply, buf.parsed);
  } else if (haveText) {
    // Parse once (cached) so we can both look up a known customer and reuse it later.
    if (!buf.parsed) buf.parsed = await parseOrder(buf.text as string);

    // Known customer (same name + phone) with a saved location → create now, skip the wait.
    const known = await knownCustomerLocation(buf.parsed);
    if (known) {
      if (buf.timer) clearTimeout(buf.timer);
      buffers.delete(sender);
      console.log(`· known customer "${buf.parsed.customer_name}" — using saved location, no wait.`);
      await processOrder(sender, buf.text as string, known.lat, known.lng, buf.reply, buf.parsed);
      return;
    }

    // Otherwise wait out the window, then create from the address if one was detected.
    if (!buf.timer) buf.timer = setTimeout(() => void finalizeNoLocation(sender), config.pairWindowMs);
    console.log(`· got order text from ${sender} — waiting ${secs}s for a location pin…`);
  } else {
    console.log(`· got location from ${sender} — waiting for the order text (within ${secs}s)`);
  }
});

console.log('Starting WhatsApp client (launching headless Chromium)…');
void client.initialize();
