import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CODE_TTL_MINUTES = 10;

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Pustak verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;min-height:100vh">
<tr>
<td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:520px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)">
<tr>
<td style="padding:0">
<div style="background:linear-gradient(135deg,#2563eb 0%,#06b6d4 100%);padding:40px 40px 32px;text-align:center">
<div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;margin-bottom:20px;backdrop-filter:blur(10px)">
<div style="font-size:28px;line-height:56px">&#128218;</div>
</div>
<h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px">Pustak</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:500">Your AI Research Assistant</p>
</div>
</td>
</tr>
<tr>
<td style="padding:40px 40px 24px">
<p style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:600">Verify your email</p>
<p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.6">Enter this code in the verification screen to complete your sign-in. For your security, this code expires in ${CODE_TTL_MINUTES} minutes.</p>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">
<div style="display:inline-block;background:linear-gradient(135deg,#eff6ff 0%,#ecfeff 100%);border:1px solid #dbeafe;border-radius:16px;padding:24px 48px;margin:0 auto">
<span style="font-size:42px;font-weight:700;letter-spacing:14px;color:#1e40af;font-family:'SF Mono','Fira Code','Courier New',monospace">${code}</span>
</div>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:0 40px 40px">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
<tr>
<td style="padding:20px 24px">
<p style="margin:0 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px">Security tip</p>
<p style="margin:0;color:#475569;font-size:13px;line-height:1.5">Never share this code with anyone. Pustak will never ask for it via phone or chat.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:0 40px 40px">
<p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center">If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.</p>
</td>
</tr>
<tr>
<td style="padding:24px 40px 40px;border-top:1px solid #e2e8f0">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5">&copy; 2026 Pustak &middot; Your personal AI research assistant</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action"); // "send" | "verify" | "check"

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "check") {
      // Validate credentials WITHOUT creating a client session.
      // For sign-in: verify the user exists and the password is correct.
      // For sign-up: verify the email is not already taken.
      const { email, password, mode } = await req.json();
      if (!email || typeof email !== "string") {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const normalized = email.trim().toLowerCase();

      if (mode === "signup") {
        const { data } = await supabase.auth.admin.listUsers();
        const exists = data?.users?.some((u) => u.email?.toLowerCase() === normalized);
        if (exists) {
          return new Response(
            JSON.stringify({ error: "An account with this email already exists" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ valid: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // mode === "signin": verify password by attempting a sign-in with the
      // service-role client (which does not persist a session on the browser).
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { data: signInData, error: signInError } =
        await anonClient.auth.signInWithPassword({ email: normalized, password });
      if (signInError || !signInData.session) {
        return new Response(
          JSON.stringify({ error: "Invalid email or password" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Immediately sign out this server-side session so the user is NOT logged
      // in until they complete the OTP step. The real sign-in happens on the
      // client after OTP verification.
      await anonClient.auth.signOut();

      return new Response(
        JSON.stringify({ valid: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "send") {
      const { email } = await req.json();
      if (!email || typeof email !== "string") {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const normalized = email.trim().toLowerCase();

      // Rate limit: max 5 codes per email per 10 minutes
      const tenMinAgo = new Date(Date.now() - CODE_TTL_MINUTES * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("email", normalized)
        .gte("created_at", tenMinAgo);
      if (count && count >= 5) {
        return new Response(
          JSON.stringify({ error: "Too many code requests. Please wait a few minutes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const code = generateCode();
      const codeHash = await hashCode(code);
      const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

      const { error: insertError } = await supabase
        .from("otp_codes")
        .insert({ email: normalized, code_hash: codeHash, expires_at: expiresAt });
      if (insertError) {
        return new Response(
          JSON.stringify({ error: "Failed to generate code" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resendKey = Deno.env.get("RESEND_API_KEY");
      let devCode: string | null = null;

      if (resendKey) {
        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Pustak <noreply@resend.dev>",
            to: [normalized],
            subject: "Your Pustak verification code",
            html: buildEmailHtml(code),
          }),
        });
        if (!sendRes.ok) {
          const errText = await sendRes.text();
          console.error("Resend send failed:", errText);
          return new Response(
            JSON.stringify({ error: "Failed to send email" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        devCode = code;
      }

      return new Response(
        JSON.stringify({ success: true, ...(devCode ? { devCode } : {}) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "verify") {
      const { email, code } = await req.json();
      if (!email || !code) {
        return new Response(
          JSON.stringify({ error: "Email and code are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const normalized = email.trim().toLowerCase();
      const codeHash = await hashCode(String(code).trim());

      const { data, error } = await supabase
        .from("otp_codes")
        .select("id, code_hash, expires_at, consumed_at")
        .eq("email", normalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (data.consumed_at) {
        return new Response(
          JSON.stringify({ error: "This code has already been used" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (new Date(data.expires_at).getTime() < Date.now()) {
        return new Response(
          JSON.stringify({ error: "This code has expired. Please request a new one." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (data.code_hash !== codeHash) {
        return new Response(
          JSON.stringify({ error: "Incorrect code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase
        .from("otp_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", data.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
