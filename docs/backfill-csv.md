# Backfill CSV — spec & AI-agent prompt

The Import / Export page (`/data`) imports historical orders from a CSV. This is
the column contract and a ready-to-use prompt for an AI agent that converts your
raw records (spreadsheet, notes, WhatsApp) into a valid import CSV.

## Columns (header row, exact order)

```
order_ref,date,customer,phone,status,payment_status,payment_method,delivery_fee,notes,product,quantity,unit_price,packaging,packaging_fee
```

One **row per line item**. Order-level fields repeat on each of an order's rows.

| Column | Fill? | Rule |
|---|---|---|
| `order_ref` | optional | Group key. Rows with the **same** ref = one multi-item order. **Leave blank** for a single-item order (each blank-ref row becomes its own order). Use simple refs like `H1`, `H2` for multi-item orders. Don't invent UUIDs. |
| `date` | **required** | Delivery date, strictly `YYYY-MM-DD`. Becomes the order/delivered/paid date. |
| `customer` | **required** | Customer name. Matched to an existing customer (case-insensitive); **created if new**. |
| `phone` | optional | Only used when creating a new customer. Digits, e.g. `081234567890`. |
| `status` | **leave empty** | **Ignored on import** — every imported order is recorded as *delivered*. |
| `payment_status` | optional | `paid` or `unpaid`. Blank → `paid`. |
| `payment_method` | optional | `cash`, `qris`, `transfer`, or `other`. Blank → none. |
| `delivery_fee` | optional | Per-order fee, plain integer IDR (taken from the order's first row). Blank → `0`. |
| `notes` | optional | Free text per order. |
| `product` | **required** | Must **exactly match an existing product name** (case-insensitive). Unknown names make the order error out. |
| `quantity` | **required** | Positive whole number. |
| `unit_price` | optional | Plain integer IDR. Blank → uses the product's current price. Fill only if the historical price differed. |
| `packaging` | optional | Must match an existing packaging option name (e.g. `Botol`). Blank → none. |
| `packaging_fee` | **leave empty** | **Ignored on import** — the fee comes from the matched packaging option. |

## Hard formatting rules (important)

- **Numbers are plain integers**: `15000`, never `15.000`, `15,000`, or `Rp 15.000`.
  (`15.000` is parsed as **15**; `Rp 15000` becomes **0**.)
- **Dates** must be `YYYY-MM-DD` (convert `12/03/2025` → `2025-03-12`).
- Quote any field containing a comma (e.g. a note) with double quotes.
- Re-importing an export is safe: rows whose `order_ref` is an existing order id are skipped.

## Worked example

A 2-item order + a separate single-item order:

```
order_ref,date,customer,phone,status,payment_status,payment_method,delivery_fee,notes,product,quantity,unit_price,packaging,packaging_fee
H1,2025-03-12,Bu Sari,081234567890,,paid,cash,5000,"Pagi, depan pagar",Susu Original 1L,2,,Botol,
H1,2025-03-12,Bu Sari,,,paid,cash,5000,,Susu Coklat 1L,1,,,
,2025-03-13,Pak Budi,,,unpaid,,0,,Susu Original 1L,3,,,
```

---

## Prompt to give the AI agent

> You are converting my historical delivery records into a CSV for import into my
> delivery app. Output **only** the CSV (no commentary), starting with this exact
> header row:
>
> `order_ref,date,customer,phone,status,payment_status,payment_method,delivery_fee,notes,product,quantity,unit_price,packaging,packaging_fee`
>
> Rules:
> - One row per product line. If an order has multiple products, repeat the
>   order-level fields and give those rows the **same `order_ref`** (use `H1`,
>   `H2`, …). For single-product orders, leave `order_ref` **blank**.
> - `date` is the delivery date in `YYYY-MM-DD` (convert any other format).
> - `customer` is required. `phone` only if known (digits only).
> - Leave `status` **empty** and `packaging_fee` **empty** — they are ignored.
> - `payment_status` is `paid` or `unpaid` (default `paid` if unknown).
>   `payment_method` is one of `cash`, `qris`, `transfer`, `other`, or blank.
> - All money/quantity values are **plain integers** — no thousand separators and
>   no "Rp" (write `15000`, not `15.000`). Leave `unit_price` blank to use the
>   current price.
> - `product` MUST be one of these exact names (match case-insensitively); skip or
>   flag any record whose product isn't in this list:
>   **[PASTE YOUR PRODUCT NAMES HERE]**
> - `packaging` must be one of (or blank): **[PASTE YOUR PACKAGING NAMES HERE]**
> - Quote any field containing a comma.
>
> Here are my records:
>
> **[PASTE YOUR RAW DATA HERE]**
