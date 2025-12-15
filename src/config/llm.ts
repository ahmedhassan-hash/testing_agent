import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  console.warn(
    "Warning: OPENROUTER_API_KEY not set. AI features will be disabled."
  );
}

// OpenRouter client using OpenAI SDK
export const llm = openRouterApiKey
  ? new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterApiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://workmate.ai",
        "X-Title": "Workmate Testing Agent",
      },
    })
  : null;

// Free model from OpenRouter
export const DEFAULT_MODEL = "amazon/nova-2-lite-v1:free";

/**
 * Simple chat completion helper
 */
export async function chat(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
  }
): Promise<string> {
  if (!llm) {
    throw new Error("LLM not configured. Set OPENROUTER_API_KEY in .env");
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const completion = await llm.chat.completions.create({
    model: options?.model || DEFAULT_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
  });

  return completion.choices[0]?.message?.content || "";
}

/**
 * Generate a decision based on current state
 */
export async function generateDecision(
  context: string,
  options: string[]
): Promise<string> {
  const prompt = `Given the current test state:
${context}

Available actions:
${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Which action should be taken next? Respond with just the action name.`;

  const response = await chat(prompt, {
    systemPrompt:
      "You are a testing agent that decides the next action to take in a test scenario. Be concise and respond with only the action name.",
    temperature: 0.3,
  });

  // Find the matching option
  const normalized = response.toLowerCase().trim();
  const match = options.find(
    (o) =>
      normalized.includes(o.toLowerCase()) ||
      o.toLowerCase().includes(normalized)
  );

  return match || options[0];
}

/**
 * Generate realistic test data
 */
export async function generateTestData(
  type: "job" | "review" | "message"
): Promise<Record<string, any>> {
  const prompts: Record<string, string> = {
    job: `Generate a realistic home service job posting. Return JSON with:
- title: string (e.g., "Fix leaking kitchen tap")
- category: one of [Plumbing, Electrical, Carpentry, Painting, Landscaping, Cleaning, General Repairs, Roofing]
- description: string (2-3 sentences)
- budget: number (100-1000 AUD)

Return ONLY valid JSON, no markdown.`,

    review: `Generate a realistic review for a tradesperson who completed a job well. Return JSON with:
- rating: number (4 or 5)
- feedback: string (1-2 sentences, positive)

Return ONLY valid JSON, no markdown.`,

    message: `Generate a realistic message from a tradesperson applying for a home repair job. Return JSON with:
- message: string (2-3 sentences, professional)
- estimatedCost: number (150-800 AUD)

Return ONLY valid JSON, no markdown.`,
  };

  const response = await chat(prompts[type], {
    systemPrompt:
      "You generate realistic test data. Always return valid JSON only.",
    temperature: 0.8,
  });

  try {
    // Clean up response - remove markdown code blocks if present
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback defaults
    const defaults: Record<string, Record<string, any>> = {
      job: {
        title: "General Home Repair",
        category: "General Repairs",
        description: "Need help with general home repairs.",
        budget: 300,
      },
      review: {
        rating: 5,
        feedback: "Excellent work, very professional!",
      },
      message: {
        message: "I am interested in this job and available to start soon.",
        estimatedCost: 250,
      },
    };
    return defaults[type];
  }
}

export { OpenAI };
