// Shared types across the app.

export type RequestStatus = "open" | "anchor_dropped" | "cancelled";
export type VoteChoice = "aye" | "rough_seas";

/**
 * Structured rules extracted from a free-form prompt by Claude.
 * We try to fill in as many fields as we can; missing values get sensible defaults
 * downstream in generateOptions.
 */
export type ParsedPrompt = {
  intent: string;                                 // human summary, e.g. "Coffee with Tony"
  participants: string[];                         // ["Tony"]
  duration_minutes: number;                       // best guess; default 45
  date_range_start: string;                       // ISO date "YYYY-MM-DD"
  date_range_end: string;                         // ISO date "YYYY-MM-DD"
  preferred_days: Weekday[];                      // [] = any
  preferred_time_of_day: TimeOfDay;               // "morning" | "afternoon" | "evening" | "any"
  location_hint: string | null;                   // free text or null
};

export type Weekday =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export type Cadence = "weekly" | "monthly" | "quarterly";

export type Schedule = {
  id: string;
  user_id: string;
  prompt: string;
  parsed: ParsedPrompt;
  cadence: Cadence;
  next_run_at: string;
  last_run_at: string | null;
  enabled: boolean;
  origin_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedOption = {
  starts_at: string;                              // ISO datetime
  ends_at: string;                                // ISO datetime
  label: string;                                  // e.g. "Fri morning, before standup"
};

export type InvitePublicPayload = {
  request: {
    id: string;
    prompt: string;
    intent: string | null;                        // parsed.intent if available
    captain_name: string;                         // request creator's display_name
    status: RequestStatus;
    scheduled_option_id: string | null;
  };
  options: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    label: string | null;
    position: number;
  }>;
};
