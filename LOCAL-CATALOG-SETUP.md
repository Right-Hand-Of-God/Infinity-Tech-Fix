# Local catalog management

The local catalog backend uses Python 3's standard library and SQLite; it needs no package installation or internet connection.

1. Double-click `start-local.bat`. It starts the local server in a minimized window, waits for it to respond, and opens the admin page; if the server is already running, it simply opens the page. Keep the minimized server window open while using the site.
2. Open `http://127.0.0.1:8765` and select the small **Admin** link at the bottom of the storefront, or go directly to `http://127.0.0.1:8765/admin`.
3. The local admin dashboard signs in automatically when opened; no login page or password is needed. This is limited to the local server running on this computer.
4. Add or edit a listing, select its storefront section, and optionally upload an image. Use JPEG, PNG, WEBP, or GIF images up to 8 MB.
5. Open `http://127.0.0.1:8765` to view the storefront. Visible catalog changes appear in the selected section.

The hosted dashboard still requires its password. Do not expose the local backend to the public internet.

The first startup imports the current phone, laptop, gadget, repair, and spare-part listings into the editable catalog. Data is stored in `catalog.sqlite3`; uploaded images are stored in `uploads`. Keep both safe when backing up the site.

This development setup binds only to `127.0.0.1`, so it is available on this computer and is not a public website or a shared online admin system. Online use requires hosting and additional deployment security.

## Hosted Admin Dashboard on Vercel

The public storefront is a static Vercel deployment. The local Python server does not run there, so deploy the `api` function and connect Supabase before hosted sign-in or catalog editing can work. The hosted API reports a setup error until its required environment variables are configured.

1. Create a Supabase project. In its SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) to create the private catalog table and public-read image bucket.
2. In the Vercel project settings, add these **private** environment variables for Production (and Preview if needed):
   - `SUPABASE_URL` — the Supabase Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — the server-side `service_role` key from Supabase's legacy API keys. Never add this key to browser code or commit it.
   - `ITECH_SESSION_SECRET` — a new random secret with at least 32 characters. Generate one in PowerShell:
     ```powershell
     $bytes = New-Object byte[] 32
     $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
     $rng.GetBytes($bytes)
     [Convert]::ToBase64String($bytes)
     ```
   - `ITECH_ADMIN_PASSWORD` — a unique, strong password for the hosted admin sign-in. Keep this different from any password used elsewhere.
3. Redeploy the Vercel project after saving its environment variables. The Vercel `api` function uses these secrets server-side and issues signed, HttpOnly sessions.
4. To copy the current local listings into Supabase, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` temporarily in PowerShell from the project folder, then run:
   ```powershell
   py -3 .\scripts\import_supabase_catalog.py
   Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY
   ```
   The import copies existing uploaded images to the Supabase bucket and keeps storefront image paths for files already deployed with the site. Run this SQL in Supabase afterward so new listing IDs continue above the imported IDs:
   ```sql
   select setval(
     pg_get_serial_sequence('public.catalog_items', 'id'),
     coalesce(max(id), 1),
     max(id) is not null
   )
   from public.catalog_items;
   ```
5. Open `https://itechfixit.vercel.app/admin.html` and sign in. The local `catalog.sqlite3` and the Supabase catalog are separate; edits on the hosted site are stored in Supabase.

The Vercel deployment excludes the local SQLite database, local uploads, Python server, and setup-only scripts using [`.vercelignore`](./.vercelignore).

## Hosted Admin Dashboard on Netlify

On Netlify, the admin dashboard is powered by the `netlify/functions/api.mts` function. Listings are stored in Netlify Database (the table and the starting catalog are created automatically on deploy) and uploaded images are stored in Netlify Blobs.

1. In the Netlify project settings, open **Environment variables** and add `ITECH_ADMIN_PASSWORD` with a strong, unique admin password. Optionally add `ITECH_SESSION_SECRET` (a random value of at least 32 characters) to sign admin sessions.
2. Redeploy the site, then open `/admin` and sign in with that password.
