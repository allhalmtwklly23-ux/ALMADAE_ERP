# Supabase Email Authentication

1. Create a Supabase project and enable Email authentication under Authentication > Providers.
2. In Authentication > URL Configuration, set the local site URL to `http://localhost:3000` and add `http://localhost:3000/account` to Redirect URLs. After purchasing `almadarthobe.com` and deploying, set the site URL to `https://almadarthobe.com` and add `https://almadarthobe.com/account` to Redirect URLs.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL`. This app's user-token verifier does not need a secret key. Never use a secret or `service_role` key in client code or commit `.env.local`.
4. Restart the Next.js dev server after changing environment variables. In Vercel, add the Supabase variables and `NEXT_PUBLIC_SITE_URL` with the final domain in Project Settings > Environment Variables, then redeploy.
5. Configure the Supabase confirmation and password-recovery email templates and SMTP sender before production. Test signup, confirmation, sign-in, recovery, password update, sign-out, and session persistence.

Supabase Auth stores and verifies passwords. This storefront does not save raw passwords. Email confirmation behavior depends on the Supabase project's Email provider settings.
