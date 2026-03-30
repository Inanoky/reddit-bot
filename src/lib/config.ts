import { Config } from "./types";

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    redditClientId: required("REDDIT_CLIENT_ID"),
    redditClientSecret: required("REDDIT_CLIENT_SECRET"),
    redditUserAgent: required("REDDIT_USER_AGENT"),
    redditUsername: required("REDDIT_USERNAME"),
    redditPassword: required("REDDIT_PASSWORD"),
    openAiApiKey: required("OPENAI_API_KEY"),
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    businessName: process.env.BUSINESS_NAME ?? "Works Recorded",
    businessUrl: process.env.BUSINESS_URL ?? "https://worksrecorded.com",
    businessDescription:
      process.env.BUSINESS_DESCRIPTION ??
      "AI-assisted content support for creators and businesses.",
    allowSubreddits: csv(process.env.ALLOW_SUBREDDITS ?? "smallbusiness,entrepreneur"),
    searchKeywords: csv(
      process.env.SEARCH_KEYWORDS ?? "content marketing,lead generation,small business growth"
    ),
    maxPostAgeHours: Number.parseInt(process.env.MAX_POST_AGE_HOURS ?? "24", 10),
    minScore: Number.parseInt(process.env.MIN_SCORE ?? "2", 10)
  };
}
