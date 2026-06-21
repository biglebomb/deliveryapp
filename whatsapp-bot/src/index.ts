import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WAMessageContent
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config';
import { parseOrder } from './parser';
import { supabase } from './supabase';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'warn' });

interface Buffer {
  text?: string;
  textTs?: number;
  lat?: number;
  lng?: number;
  locTs?: number;
}

const buffers = new Map<string, Buffer>();

function getText(msg: WAMessageContent | null | undefined): string | null {
  return msg?.conversation ?? msg?.extendedTextMessage?.text ?? null;
}

function getLocation(msg: WAMessageContent | null | undefined): { lat: number; lng: number } | null {
  const loc = msg?.locationMessage;
  if (loc && typeof loc.degreesLatitude === 'number' && typeof loc.degreesLongitude === 'number') {
    return { lat: loc.degreesLatitude, lng: loc.degreesLongitude };
  }
  return null;
}

async function processOrder(sender: string, chat: string, orderText: string, lat: number, lng: number, reply: (text: string) => Promise<void>) {
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

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, logger });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nScan this QR in WhatsApp → Settings → Linked devices:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('✓ WhatsApp connected.');
      if (config.discover) console.log('DISCOVER mode: send a message in your Orders chat to see its JID.');
      else if (!config.ordersChatJid) console.log('⚠ ORDERS_CHAT_JID is empty — listening to ALL chats. Run `npm run discover` to find it.');
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete the auth/ folder and re-run to pair again.');
      } else {
        console.log('Connection closed, reconnecting…');
        void start();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const chat = m.key.remoteJid ?? '';
      const sender = m.key.participant ?? chat;
      const text = getText(m.message);
      const loc = getLocation(m.message);

      if (config.discover) {
        const preview = loc ? '[location]' : text ? JSON.stringify(text).slice(0, 60) : '[other]';
        console.log(`[discover] chat=${chat} sender=${sender} name=${m.pushName ?? ''} ${preview}`);
        continue;
      }

      if (config.ordersChatJid && chat !== config.ordersChatJid) continue;
      if (!text && !loc) continue;

      const now = Date.now();
      const buf = buffers.get(sender) ?? {};
      if (text) {
        buf.text = text;
        buf.textTs = now;
      }
      if (loc) {
        buf.lat = loc.lat;
        buf.lng = loc.lng;
        buf.locTs = now;
      }
      buffers.set(sender, buf);

      const fresh = (ts?: number) => ts !== undefined && now - ts <= config.pairWindowMs;
      if (buf.text && buf.lat !== undefined && buf.lng !== undefined && fresh(buf.textTs) && fresh(buf.locTs)) {
        const { text: orderText, lat, lng } = buf as Required<Buffer>;
        buffers.delete(sender);
        await processOrder(sender, chat, orderText, lat, lng, (t) => sock.sendMessage(chat, { text: t }).then(() => undefined));
      }
    }
  });
}

void start();
