# Local catalog management

The local catalog backend uses Python 3's standard library and SQLite; it needs no package installation or internet connection.

1. Double-click `start-local.bat`. It starts the local server in a minimized window, waits for it to respond, and opens the admin page; if the server is already running, it simply opens the page. Keep the minimized server window open while using the site.
2. Open `http://127.0.0.1:8765` and select **Admin Login** in the header, or go directly to `http://127.0.0.1:8765/admin`.
3. Sign in using the single admin password `Itechfix`; no username is needed. On first startup after this update, the local database switches to this password and stores it as a salted hash.
4. Add or edit a listing, select its storefront section, and optionally upload an image. Use JPEG, PNG, WEBP, or GIF images up to 8 MB.
5. Open `http://127.0.0.1:8765` to view the storefront. Visible catalog changes appear in the selected section.

The admin page uses one password-only sign-in. Buyers cannot read or change admin listings without an authenticated session.

The admin password cannot be reset from this local admin page. Do not expose this backend to the public internet.

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
   - `ITECH_ADMIN_PASSWORD` — the one password for the hosted admin sign-in. Set it to `Itechfix` to match the local admin. This password is weak and makes the public admin easier to compromise; use a unique, stronger password for any public deployment.
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
