import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function anthropic() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

// Haiku is fast + cheap and easily handles structured-output prompt parsing.
export const PROMPT_PARSE_MODEL = "claude-haiku-4-5-20251001";
