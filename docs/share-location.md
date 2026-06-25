# Getting a WhatsApp location into a new order

A PWA can't intercept a WhatsApp location pin tap (only Google Maps gets that).
The working model is **share/paste the location into the app**, which opens
New Order with the pin already set and the delivery area auto-assigned.

New Order accepts a shared/deep-linked location three ways:

- `/orders/new?lat=<lat>&lng=<lng>` — explicit coordinates
- `/orders/new?gmaps=<maps-url-or-text>` — a Google Maps link or "lat,lng" text
- The **Web Share Target** (Android) — sharing a link/text routes here as
  `?url=…`/`?text=…`, which is parsed the same way.

## Android (built in)

The PWA is registered as a share target, so it appears in the system share sheet.

1. In WhatsApp, tap the location → it opens in Google Maps.
2. Maps → **Share** → **Milk Delivery**.
3. New Order opens with the pin set.

(Short `maps.app.goo.gl` links are resolved server-side via the
`resolve-maps-link` edge function.)

## iPhone (one-time Shortcut setup)

iOS Safari doesn't support Web Share Target, so use an Apple **Shortcut** that
appears in the Share Sheet:

1. Shortcuts app → **+** → name it e.g. "New milk order".
2. Add action **Get URLs from Input** (or **Get Text from Input**).
3. Add action **Open URLs** → set the URL to:
   `https://<your-app-domain>/orders/new?gmaps=` and append the URL/Text
   variable from step 2 to the end.
4. Tap the Shortcut's **ⓘ** → enable **Show in Share Sheet**, accept input type
   **URLs / Text**.

Then: WhatsApp location → Maps → **Share** → **New milk order** → the PWA opens
with the pin set.

## Universal fallback (works everywhere, no setup)

New Order's location picker has a **"Paste lat,lng or Maps link"** field. Copy
the location/link from WhatsApp or Maps and paste it — same result, on any device.
