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

// Real ElevenLabs voice IDs from official documentation
const VOICE_MAPPING: Record<string, string> = {
  // English voices
  jessica: 'XrExE9yKIg1WjnnlVkGX',    // Matilda - warm, young female, American (perfect for podcasts)
  // Multilingual voices that work well for Hindi
  akash: 'onwK4e9ZLuTAKqWW03F9',       // Daniel - deep male, British
  anjali: '21m00Tcm4TlvDq8ikWAM',      // Rachel - calm young female, American
  kanika: 'EXAVITQu4vr4xnSDxMaL',      // Sarah - soft young female, American
  // Additional language voices
  maria: 'ErXwobaYiN019PkySvjV',       // Antoni - young male, American
  charlotte: 'XB0fDUnXU5powFXDhCwa',   // Charlotte - middle-aged female, English-Swedish
  hans: 'pNInz6obpgDQGcFmaJgB',       // Adam - deep male, American
  yuki: 'IKne3meq5aSn9XLyUdCD',        // Charlie - male, Australian
};

const DEFAULT_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda

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

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!elevenLabsApiKey) {
      console.error('ElevenLabs API key not configured');
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured. Please add ELEVENLABS_API_KEY to your secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const voiceId = VOICE_MAPPING[voice] || DEFAULT_VOICE_ID;
    console.log('Using voice ID:', voiceId);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    console.log('ElevenLabs API status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('Audio buffer size:', audioBuffer.byteLength);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
