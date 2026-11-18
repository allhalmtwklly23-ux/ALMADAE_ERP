This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase persistence

The application uses local JSON stores in development unless both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. Production refuses to fall back to local JSON storage.

If the local authentication store cannot be read or has an invalid structure, authentication fails instead of replacing that file. Preserve the file and restore it from a verified backup before retrying; do not remove it to force a new administrator account.

1. Copy `.env.example` to `.env.local`. Set the Supabase project URL and service-role key locally. Keep the service-role key server-only; never use a `NEXT_PUBLIC_` prefix or commit `.env.local`.
2. In the Supabase SQL Editor, apply any pending migrations in timestamp order: `supabase/migrations/20261115000000_erp_persistence.sql`, `supabase/migrations/20261116000000_tenant_einvoice_foundation.sql`, `supabase/migrations/20261116010000_membership_status_and_roles.sql`, `supabase/migrations/20261116020000_einvoice_response_column_compatibility.sql`, `supabase/migrations/20261116030000_team_messages.sql`, then `supabase/migrations/20261116040000_team_conversations.sql`. Do not rerun a migration that has already succeeded.
3. Before the first login to the new database, import existing local ERP data and password hashes atomically:

   ```powershell
   node scripts/import-json-to-supabase.mjs --dry-run
   node scripts/import-json-to-supabase.mjs
   ```

   The import reads `data/erp-store.json` and `data/auth-store.json`, and stops without changing the database unless the target company has no users, records, or audit entries. Sessions are deliberately not imported; users sign in again after migration.
4. Add the same server-only variables to the Vercel project's Production and Preview environments. Set `ERP_COMPANY_ID` only when choosing a non-default initial company; company switching is stored in each server-side session and should not be configured by changing this variable. `AUTH_BOOTSTRAP_PASSWORD` is only needed when the database has no imported administrator; configure a unique secret directly in the hosting dashboard.
5. Redeploy after changing Vercel environment variables. Configure secrets in Vercel/Supabase dashboards rather than sharing them in chat or source control.

The tenant/e-invoice migrations add membership, tax-profile, EGS-unit, invoice-submission, and outbox tables, seed memberships for existing database users, and support per-session company selection. A super administrator can create a company from user management, then switch to it through the account menu; the company and initial membership are created atomically. Existing ERP records are not moved or rewritten. Keep private keys and secret credentials in a dedicated secret store; the EGS table is designed to hold a secret reference, not the secret itself. Invoice generation/submission and ZATCA compliance are not implemented by applying the migrations.

The service-role key bypasses Row Level Security and is used only by server-side API handlers. Browser requests continue to go through authenticated APIs. Apply all migrations before setting production database variables; otherwise affected APIs return a configuration/database error rather than use ephemeral storage. The new tables have RLS enabled without client policies and are intended for controlled server-side access.

## Team messages

The team application supports direct text messages to active members of the current company. Messages can be viewed by their sender, recipient and the current company's system administrator; the interface discloses administrator access. When the application is visible and focused, opening a conversation marks its displayed incoming messages as read; messages loaded later are marked as they appear. Conversation history loads in pages of 50, including conversations with users who are no longer active. The administrator oversight view displays the latest 200 messages, not a complete searchable archive. Drafts are kept while the page remains open but are not persisted.

The shell displays a count of unread messages, and the chat and count poll every 20 seconds while open without extending the idle session. This is not browser push, email, or an offline delivery guarantee. Messages contain text only; attachments and message editing/deletion are not implemented.

In Supabase mode, apply `20261116030000_team_messages.sql` and `20261116040000_team_conversations.sql` before using this feature. Messages are stored separately from generic ERP records and are **not included in the application's ERP backup or JSON-to-Supabase import**. Include the message table in database backups and arrange separate migration of local messages before switching storage modes; no automatic import is provided. Local development uses a separate `data/team-messages.json` file and is intended for a single server process, not multi-instance or production deployment. Protect backups and files as they contain message contents.

Management hierarchy, orders, and notifications for events in other applications are not implemented yet.

## Sales product preview

The sales invoice editor shows products only when searching by name, reference, SKU, barcode, group or category; scanning an exact barcode or SKU and pressing Enter adds the product. Product preview shows posted purchase lines linked by product ID, or by SKU/barcode for older lines without an ID. The displayed product cost is the recorded cost, not a calculated inventory valuation.

The preview's cost and supplier history require product-view access and either the sales manager role, purchase-invoice view access, or the additional `productCosts:view` permission. A system administrator can grant the additional permission from user management. Purchase-invoice view access independently exposes purchase data, and audit/backup access has its own privileges.

New sales invoices created in the sales editor use VAT-exclusive unit prices and a fixed 15% rate for every line. They support fixed-amount or percentage discounts per line and on the whole invoice. Line discounts apply first, then the invoice discount is allocated proportionally across the remaining line amounts using largest-remainder allocation, with ties resolved by line order. VAT is calculated on each discounted line. Quantities support three decimal places, prices and discount values two; line amounts, discounts and VAT are rounded to the nearest halala. The server recalculates totals rather than trusting submitted totals. Existing invoices retain their original calculation mode, and the POS and operations editors retain their previous behavior; this is not a full tax engine and does not support exempt, zero-rated or other tax categories. Printed documents remain operational previews, not ZATCA-compliant e-invoices.

Invoice previews include a Code 128 barcode containing the invoice reference, not a ZATCA QR code or a link to the invoice. The barcode requires a nonblank reference of at most 40 printable ASCII characters; unsupported references show an explanation instead. It is generated at display time without modifying existing records. Physical scan quality depends on printer, scale and paper; verify it with the intended equipment.

The sales editor offers an unsaved live review of invoice lines, discounts and VAT, along with stock warnings aggregated across repeated product lines and a manual stock refresh. These warnings use the most recently loaded product balances and are advisory: stock may change before posting, and the server remains responsible for checking it. Previewing does not save, reserve or post anything; saving still attempts the existing automatic posting, leaving a draft if posting fails.

The application launcher also lists a searchable catalogue of planned business applications and their intended integration points. Proposed apps include hierarchy-based orders and sales-manager-assigned customer visits with location matching. These entries are not active applications, do not store data or collect locations, and are not integrated until each workflow is separately designed, implemented and tested.

Sales and purchase invoice editors can search the customer or supplier by stored name, contact, tax/registration number, city or category, including Arabic digits and common phone formatting. Search filters the selection list but does not change the selected party until explicitly chosen. The purchase editor also supports searching/scanning products; supplier records can optionally store legal, tax, registration, address and payment-term details. These details are not automatically copied into existing invoices or validated for tax compliance.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
