import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Source {
  name: string;
  type: string;
  content: string | null;
  file_url: string | null;
}

interface ChatRequest {
  question: string;
  sources: Source[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchWebContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...';
    }

    return text;
  } catch (error) {
    console.error('Error fetching URL:', error);
    return `[Could not fetch content from URL: ${url}]`;
  }
}

function isGreeting(text: string): boolean {
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'howdy'];
  const lowerText = text.toLowerCase().trim();
  return greetings.includes(lowerText) || greetings.some(g => lowerText.startsWith(g + ' '));
}

function isGenerationCommand(text: string): { isGeneration: boolean; mode: string | null } {
  const upperText = text.toUpperCase();
  if (upperText.startsWith('GENERATE_')) {
    const mode = upperText.replace('GENERATE_', '').toLowerCase();
    return { isGeneration: true, mode };
  }
  return { isGeneration: false, mode: null };
}

function getGenerationPrompt(mode: string, context: string): string {
  switch (mode) {
    case 'summary':
      return `Create a comprehensive summary of the following sources. Synthesize the key information into a cohesive narrative that captures the main points, themes, and insights. Make it engaging and informative.

Sources:
${context}

Provide a well-structured summary that flows naturally and highlights the most important information.`;

    case 'notes':
      return `Convert the following sources into well-organized study notes. Use clear headings, bullet points, and numbered lists where appropriate. Structure the information for easy review and learning.

Sources:
${context}

Create comprehensive notes with:
- Main topics as headings
- Key points as bullet points
- Important details highlighted
- Connections between concepts`;

    case 'ideas':
      return `Analyze the following sources and generate creative ideas, insights, and connections. Think about:
- Key themes and patterns
- Interesting connections between sources
- Potential applications or implications
- Questions for further exploration
- Novel perspectives

Sources:
${context}

Provide a thoughtful analysis with specific ideas and actionable insights.`;

    case 'podcast':
      return `Transform the following sources into a narration-ready podcast monologue. Write as direct speech that can be read aloud - no host names, no speaker labels, no stage directions like [pause] or (music). Just flowing spoken content.

Sources:
${context}

Write narration that:
- Opens with an engaging hook (start speaking directly to the listener)
- Flows naturally as one continuous narrative
- Uses conversational, spoken language
- Transitions smoothly between ideas
- Highlights key insights clearly
- Ends with a memorable takeaway
- Never uses: "Host:", narrator:", [brackets], (parentheses for directions), or placeholder names

Write exactly what the AI voice should say - nothing more, nothing less.`;

    default:
      return `Summarize the following content:\n\n${context}`;
  }
}

async function generateAIResponse(question: string, context: string, hasSources: boolean): Promise<{ answer: string; citations: Array<{ source: string; text: string }> }> {
  const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

  console.log('=== AI Response Generation ===');
  console.log('Question:', question);
  console.log('Has Mistral API Key:', !!mistralApiKey);
  console.log('Has Gemini API Key:', !!geminiApiKey);
  console.log('Has Sources:', hasSources);
  console.log('Context length:', context.length);

  // Handle greetings with a friendly response
  if (isGreeting(question)) {
    if (!hasSources) {
      return {
        answer: `Hello! I'm your AI research assistant. Upload some sources (text, links, or files) first, then I can help you explore and understand them!`,
        citations: []
      };
    }
    return {
      answer: `Hello! I'm your AI research assistant. I can help you explore and understand your uploaded sources. Try asking me questions about your documents, or ask me to summarize or compare information.`,
      citations: []
    };
  }

  // Check for generation commands
  const genCheck = isGenerationCommand(question);
  if (genCheck.isGeneration && genCheck.mode) {
    if (!hasSources || context.length < 50) {
      return {
        answer: `Please add some sources first so I can generate ${genCheck.mode} for you!`,
        citations: []
      };
    }
  }

  // Check if we have actual source content
  if (!hasSources || context.length < 50) {
    return {
      answer: `I don't have any sources to work with yet. Please upload some text, links, or files first, then I can help answer your questions about them!`,
      citations: []
    };
  }

  let systemPrompt: string;
  let userPrompt: string;

  // Handle generation mode vs regular question
  if (genCheck.isGeneration && genCheck.mode) {
    systemPrompt = `You are NotebookLM, a creative AI research assistant. Generate high-quality content based on the provided sources. Be engaging, insightful, and well-structured.`;
    userPrompt = getGenerationPrompt(genCheck.mode, context);
  } else {
    systemPrompt = `You are NotebookLM, a helpful AI research assistant. Answer questions based on the provided sources.

Rules:
1. Use ONLY information from the provided sources
2. Cite sources by putting the source name in brackets like [Source Name]
3. If sources don't answer the question, say so clearly
4. Be concise and helpful`;
    userPrompt = `Sources:\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer based on these sources only. Cite sources using [Source Name] format.`;
  }

  // Try Mistral API first (recommended)
  if (mistralApiKey) {
    try {
      console.log('Calling Mistral API...');

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralApiKey}`,
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 1024,
          temperature: 0.3,
        })
      });

      console.log('Mistral API status:', response.status);

      if (response.ok) {
        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content;

        if (answer) {
          console.log('Mistral response received, length:', answer.length);
          const citations: Array<{ source: string; text: string }> = [];
          const sourceMatches = answer.match(/\[([^\]]+)\]/g);
          if (sourceMatches) {
            const uniqueSources = [...new Set(sourceMatches.map(m => m.slice(1, -1)))];
            uniqueSources.forEach(source => {
              citations.push({ source, text: `Referenced in response` });
            });
          }
          return { answer, citations };
        }
      } else {
        const errorText = await response.text();
        console.error('Mistral API error:', response.status, errorText);
      }
    } catch (error) {
      console.error('Mistral request failed:', error);
    }
  }

  // Try Gemini API as fallback
  if (geminiApiKey) {
    console.log('API Key prefix:', geminiApiKey.substring(0, 3));

    // Try multiple authentication methods for AQ. keys
    const authMethods = [
      {
        name: 'x-goog-api-key header',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        }
      },
      {
        name: 'query param',
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Bearer token',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${geminiApiKey}`,
        }
      },
    ];

    for (const method of authMethods) {
      try {
        console.log(`Trying auth method: ${method.name}`);

        const response = await fetch(method.url, {
          method: 'POST',
          headers: method.headers,
          body: JSON.stringify({
            contents: [{
              parts: [{ text: userPrompt }]
            }],
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.3,
            }
          })
        });

        console.log(`${method.name} response:`, response.status);

        if (response.ok) {
          const data = await response.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (answer) {
            console.log('Success with method:', method.name);
            const citations: Array<{ source: string; text: string }> = [];
            const sourceMatches = answer.match(/\[([^\]]+)\]/g);
            if (sourceMatches) {
              const uniqueSources = [...new Set(sourceMatches.map(m => m.slice(1, -1)))];
              uniqueSources.forEach(source => {
                citations.push({ source, text: `Referenced in response` });
              });
            }
            return { answer, citations };
          }
        } else {
          const errorText = await response.text();
          console.error(`${method.name} failed:`, response.status, errorText.substring(0, 200));
        }
      } catch (error) {
        console.error(`${method.name} error:`, error);
      }
    }
    console.error('All Gemini auth methods failed');
  }

  // Fallback: Extract relevant content based on keywords
  return generateFallbackResponse(question, context);
}

function generateFallbackResponse(question: string, context: string): { answer: string; citations: Array<{ source: string; text: string }> } {
  const lowerQuestion = question.toLowerCase();
  const keywords = lowerQuestion.split(' ').filter(w => w.length > 3);

  // Find relevant sections
  const sections = context.split('\n\n---\n\n');
  const relevantSections = sections.filter(section =>
    keywords.some(keyword => section.toLowerCase().includes(keyword))
  );

  if (relevantSections.length > 0) {
    return {
      answer: `Based on your sources, I found this relevant information:\n\n${relevantSections.slice(0, 3).join('\n\n')}\n\nNote: For more intelligent AI-powered analysis, ensure your GEMINI_API_KEY is valid and configured.`,
      citations: []
    };
  }

  // Return the first part of context as a fallback
  if (sections.length > 0) {
    return {
      answer: `Here's what I found in your sources:\n\n${sections.slice(0, 2).join('\n\n')}\n\nAsk a more specific question or try using keywords from your sources. For better AI analysis, check that your GEMINI_API_KEY is valid.`,
      citations: []
    };
  }

  return {
    answer: `I searched your sources but couldn't find relevant information for "${question}". Try asking about specific topics or keywords from your uploaded sources.`,
    citations: []
  };
}

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
    const { question, sources } = await req.json() as ChatRequest;

    console.log('=== Request received ===');
    console.log('Question:', question);
    console.log('Sources count:', sources?.length || 0);

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          answer: "Please upload some sources (text, links, or files) first so I can help answer your questions!",
          citations: [],
          sourcesUsed: []
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from sources
    let contextParts: string[] = [];

    for (const source of sources) {
      let sourceContent = '';

      if (source.type === 'link') {
        const url = source.content || source.file_url;
        if (url) {
          const webContent = await fetchWebContent(url);
          sourceContent = `[${source.name}] (${url}):\n${webContent}`;
        }
      } else if (source.content) {
        sourceContent = `[${source.name}]:\n${source.content}`;
      } else if (source.type === 'image' && source.file_url) {
        sourceContent = `[${source.name}]:\n[Image file uploaded]`;
      } else if (source.file_url) {
        if (source.file_url.endsWith('.txt') || source.file_url.endsWith('.md')) {
          try {
            const response = await fetch(source.file_url);
            if (response.ok) {
              const text = await response.text();
              sourceContent = `[${source.name}]:\n${text.substring(0, 5000)}`;
            }
          } catch {
            sourceContent = `[${source.name}]:\n[File: ${source.file_url}]`;
          }
        } else {
          sourceContent = `[${source.name}]:\n[File uploaded: ${source.type}]`;
        }
      }

      if (sourceContent) {
        contextParts.push(sourceContent);
      }
    }

    const context = contextParts.join('\n\n---\n\n');
    const hasSources = contextParts.length > 0 && context.length > 50;

    console.log('Context parts:', contextParts.length);
    console.log('Has real content:', hasSources);

    const { answer, citations } = await generateAIResponse(question, context, hasSources);

    return new Response(
      JSON.stringify({
        answer,
        citations,
        sourcesUsed: sources.map(s => s.name),
        debug: {
          contextLength: context.length,
          sourceCount: sources.length,
          contextPreview: context.substring(0, 500)
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
