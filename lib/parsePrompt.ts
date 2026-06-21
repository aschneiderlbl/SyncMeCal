import { z } from "zod";
import { anthropic, PROMPT_PARSE_MODEL } from "@/lib/anthropic";
import type { ParsedPrompt } from "@/lib/types";

const ParsedSchema = z.object({
  intent: z.string(),
  participants: z.array(z.string()).default([]),
  duration_minutes: z.number().int().positive().default(45),
  date_range_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_range_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_days: z
    .array(
      z.enum(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]),
    )
    .default([]),
  preferred_time_of_day: z.enum(["morning","afternoon","evening","any"]).default("any"),
  preferred_start_hour: z.number().min(0).max(23.99).nullable().default(null),
  location_hint: z.string().nullable().default(null),
});

const SYSTEM_PROMPT = `You extract structured scheduling rules from informal prompts.
Today is {today}. Always return JSON matching the provided schema exactly.

Rules:
- If a date range is vague, interpret it relative to today. Use the nearest
  upcoming instance — if today is June, "fall" means this Sep–Nov, not next year.
  "spring" = Mar 1–May 31.
  "summer" = Jun 1–Aug 31.
  "fall" or "autumn" = Sep 1–Nov 30.
  "winter" = Dec 1–Feb 28.
  "Q1/Q2/Q3/Q4" = the nearest upcoming calendar quarter.
  "next week" = the upcoming Mon–Fri.
  "this month" = today through the last day of the month.
  "next month" = the full following calendar month.
- If no duration is given:
    coffee → 45
    lunch → 60
    dinner → 90
    meeting → 30
    golf → 240
    drinks → 90
    default → 45
- preferred_days are lowercased weekday names. Empty = any.
- preferred_time_of_day: morning (06–11), afternoon (12–17), evening (17–21), any.
- preferred_start_hour: if the prompt names an EXACT start time ("at 8am", "starting at 2pm", "at 8:30"),
  return it as decimal hours in 24h (8am = 8, 2pm = 14, 8:30am = 8.5). Otherwise null.
- intent is a short human-readable summary like "Coffee with Tony".
- participants is just first names extracted from the prompt (excluding the user).
`;

/**
 * Parse a free-form prompt into structured scheduling rules using Claude.
 */
export async function parsePromptWithClaude(prompt: string): Promise<ParsedPrompt> {
  const today = new Date().toISOString().slice(0, 10);

  const resp = await anthropic().messages.create({
    model: PROMPT_PARSE_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT.replace("{today}", today),
    messages: [
      {
        role: "user",
        content: `Prompt: "${prompt}"

Return ONLY a JSON object with this exact shape (no prose, no markdown):
{
  "intent": "...",
  "participants": ["..."],
  "duration_minutes": 45,
  "date_range_start": "YYYY-MM-DD",
  "date_range_end": "YYYY-MM-DD",
  "preferred_days": ["friday"],
  "preferred_time_of_day": "morning",
  "preferred_start_hour": null,
  "location_hint": null
}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // The model occasionally wraps JSON in ```json fences — strip if present.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON: ${text.slice(0, 200)}`);
  }

  return ParsedSchema.parse(parsed);
}
