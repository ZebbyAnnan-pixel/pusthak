import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface NarrateRequest {
  text: string;
  voice: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Map our voice IDs to language codes for Google Translate TTS
const VOICE_LANGUAGE_MAP: Record<string, string> = {
  jessica: 'en',
  akash: 'hi',
  anjali: 'hi',
  kanika: 'hi',
  maria: 'es',
  charlotte: 'fr',
  hans: 'de',
  yuki: 'ja',
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { text, voice } = await req.json() as NarrateRequest;

    console.log('=== Podcast Narration Request ===');
    console.log('Voice:', voice);
    console.log('Text length:', text?.length || 0);

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lang = VOICE_LANGUAGE_MAP[voice] || 'en';
    console.log('Using language code:', lang);

    // Google Translate TTS has a ~200 char limit per request, so we chunk the text
    const MAX_CHUNK = 190;
    let narrationText = text.trim();

    // Truncate to a reasonable max for a free TTS service (3000 chars)
    if (narrationText.length > 3000) {
      const truncated = narrationText.substring(0, 3000);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? '),
      );
      narrationText = lastSentenceEnd > 1500
        ? truncated.substring(0, lastSentenceEnd + 1)
        : truncated;
      console.log(`Truncated text from ${text.trim().length} to ${narrationText.length} chars`);
    }

    // Split into chunks at sentence boundaries
    const chunks: string[] = [];
    let remaining = narrationText;
    while (remaining.length > MAX_CHUNK) {
      let splitAt = remaining.lastIndexOf('. ', MAX_CHUNK);
      if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', MAX_CHUNK);
      if (splitAt === -1) splitAt = MAX_CHUNK;
      chunks.push(remaining.substring(0, splitAt + 1).trim());
      remaining = remaining.substring(splitAt + 1).trim();
    }
    if (remaining) chunks.push(remaining);

    console.log(`Split into ${chunks.length} chunks`);

    // Fetch audio for each chunk
    const audioBuffers: Uint8Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;

      const response = await fetch(ttsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
      });

      console.log(`Chunk ${i + 1}/${chunks.length} status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`TTS chunk ${i + 1} failed:`, response.status, errorText.substring(0, 200));
        throw new Error(`TTS service returned ${response.status}`);
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      audioBuffers.push(buffer);
    }

    // Concatenate all MP3 chunks
    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    console.log('Combined audio size:', combined.byteLength);

    return new Response(combined.buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Length': combined.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: "Failed to generate audio", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
