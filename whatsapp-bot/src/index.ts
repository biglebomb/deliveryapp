import qrcode from 'qrcode-terminal';
// whatsapp-web.js is CommonJS — default-import then destructure (named ESM imports fail).
import pkg from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import { config } from './config';

const { Client, LocalAuth } = pkg;
import { extractMapsUrl, resolveMapsLink } from './maps-link';
import { parseOrder } from './parser';
import { supabase } from './supabase';

interface Buffer {
  text?: string;
  textTs?: number;
  lat?: number;
  lng?: number;
  locTs?: number;
}

const buffers = new Map<string, Buffer>();

// Set when the client is ready; we ignore any message older than this so the
// history WhatsApp replays on initial sync never creates orders.
let readyAt = 0;

async function processOrder(
  sender: string,
  orderText: string,
  lat: number,
  lng: number,
  reply: (text: string) => Promise<void>
) {
  try {
    const parsed = await parseOrder(orderText);
    const { error } = await supabase.from('order_inbox').insert({
      raw_text: orderText,
      parsed,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      sender,
      status: 'pending'
    });
    if (error) throw error;
    console.log(`✓ Inbox +1: ${parsed.customer_name ?? 'order'} — ${parsed.items.length} item(s)`);
    if (config.ackReply) await reply('Pesanan diterima, sedang diproses. 🙏');
  } catch (err) {
    console.error('Failed to process order:', err);
  }
}

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

  if (config.discover) {
    const preview = loc ? '[location]' : text ? JSON.stringify(text).slice(0, 60) : '[other]';
    console.log(`[discover] chat=${chat} sender=${sender} fromMe=${msg.fromMe} ${preview}`);
    return;
  }

  if (config.ordersChatJid && chat !== config.ordersChatJid) return;
  // Admin control: only the owner's own forwards become orders.
  if (config.onlyFromMe && !msg.fromMe) return;
  if (!text && !loc) return;

  const now = Date.now();
  const buf = buffers.get(sender) ?? {};
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
    const { text: orderText, lat, lng } = buf as Required<Buffer>;
    buffers.delete(sender);
    console.log(`· paired text + location from ${sender} — creating order…`);
    await processOrder(sender, orderText, lat, lng, (t) => msg.reply(t).then(() => undefined));
  } else {
    const got = text ? 'order text' : 'location';
    const waiting = haveText ? 'a location pin' : 'the order text';
    const secs = Math.round(config.pairWindowMs / 1000);
    console.log(`· got ${got} from ${sender} — waiting for ${waiting} (within ${secs}s)`);
  }
});

console.log('Starting WhatsApp client (launching headless Chromium)…');
void client.initialize();
