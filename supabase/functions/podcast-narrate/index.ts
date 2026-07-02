import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Podcast narration via ElevenLabs text-to-speech
interface NarrateRequest {
  text: string;
  voice: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VOICE_MAPPING: Record<string, string> = {
  jessica: 'cgSgspJ2msm6clMCkdW9',
  akash: 'cjVigY5qzO86Huf0OWal',
  anjali: 'EXAVITQu4vr4xnSDxMaL',
  kanika: 'JBFqnCBsd6RMkjVDRZzb',
  maria: 'pFZP5JQG7iQjIQuC4Bku',
  charlotte: 'Xb7hH8MSUJpSbSDYk0k2',
  hans: 'nPczCjzI2devNBz1zQrb',
  yuki: 'onwK4e9ZLuTAKqWW03F9',
};

const DEFAULT_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

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

    const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY") || "sk_71c72500a33be4f9a456dff6a1d91dd632a5d8fd02f53dc5";
    if (!elevenLabsApiKey) {
      console.error('ELEVENLABS_API_KEY not set');
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const voiceId = VOICE_MAPPING[voice] || DEFAULT_VOICE_ID;
    console.log('Using voice ID:', voiceId);

    // Truncate to stay within quota limits
    const MAX_CHARS = 200;
    let narrationText = text.trim();
    if (narrationText.length > MAX_CHARS) {
      const truncated = narrationText.substring(0, MAX_CHARS);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? '),
      );
      narrationText = lastSentenceEnd > MAX_CHARS * 0.5
        ? truncated.substring(0, lastSentenceEnd + 1)
        : truncated;
      console.log(`Truncated text from ${text.trim().length} to ${narrationText.length} chars`);
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      },
      body: JSON.stringify({
        text: narrationText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    console.log('ElevenLabs response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      let errorDetail = `ElevenLabs API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail?.message) errorDetail = errorJson.detail.message;
        else if (errorJson.detail) errorDetail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
      } catch { /* use default */ }
      return new Response(
        JSON.stringify({ error: errorDetail }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('Audio size:', audioBuffer.byteLength);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
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
