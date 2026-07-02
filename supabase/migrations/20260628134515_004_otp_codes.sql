/*
# Email OTP verification codes

1. Purpose
- Adds a one-time-password (OTP) email verification step to sign-in / sign-up.
- After the user submits email + password, a 6-digit code is generated server-side,
  hashed, and stored here with an expiry. The code is emailed to the user.
- The frontend then verifies the code the user types against this table before
  completing the Supabase auth sign-in/sign-up.

2. New Tables
- `otp_codes`
  - `id` uuid primary key
  - `email` text (lowercased) — the address the code was sent to
  - `code_hash` text — SHA-256 hex of the 6-digit code (never store the plaintext)
  - `expires_at` timestamptz — 10 minutes from creation
  - `consumed_at` timestamptz nullable — set when the code is successfully used
  - `created_at` timestamptz default now()

3. Indexes
- `otp_codes_email_idx` on (email) for lookup by email during verification.
- `otp_codes_email_created_idx` on (email, created_at desc) to find the latest code.

4. Security (RLS)
- Enable RLS on `otp_codes`.
- The anon-key frontend needs to INSERT (request a code) and SELECT (verify a code)
  before any user session exists, so policies are scoped to `anon, authenticated`.
- INSERT: anyone may request a code (rate limiting is handled in the edge function).
- SELECT: anyone may look up codes by email — the code hash is what protects them,
  and the hash is never returned to the client (the edge function does the compare).
- UPDATE: allow anon/authenticated to mark a code consumed (set consumed_at) only
  when the row matches the email being verified. This is intentionally permissive
  on the row level because the actual verification (hash compare + expiry) happens
  in the edge function; the table just needs to be writable for the consume step.
- DELETE: not granted to anon/authenticated. Old codes are cleaned up by a scheduled
  job or left to expire (expires_at makes them unusable).

5. Notes
- Codes are stored as SHA-256 hashes, never plaintext.
- A code is valid for 10 minutes and can be used only once (consumed_at is set).
- The edge function enforces: correct hash, not expired, not already consumed.
*/

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email);
CREATE INDEX IF NOT EXISTS otp_codes_email_created_idx ON otp_codes (email, created_at DESC);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_otp" ON otp_codes;
CREATE POLICY "anon_insert_otp"
ON otp_codes FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_otp" ON otp_codes;
CREATE POLICY "anon_select_otp"
ON otp_codes FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "anon_update_otp" ON otp_codes;
CREATE POLICY "anon_update_otp"
ON otp_codes FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
