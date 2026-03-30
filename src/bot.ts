import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import OpenAI from "openai";
import Snoowrap, { Submission } from "snoowrap";

dotenv.config();

type NullableApproval = boolean | null;

interface Config {
  redditClientId: string;
  redditClientSecret: string;
  redditUserAgent: string;
  redditUsername: string;
  redditPassword: string;
  openAiApiKey: string;
  openAiModel: string;
  businessName: string;
  businessUrl: string;
  businessDescription: string;
  allowSubreddits: string[];
  searchKeywords: string[];
  postsPerDay: number;
  discoveryLimitPerSub: number;
  maxPostAgeHours: number;
  minScore: number;
  queueDir: string;
  pendingFile: string;
  postedFile: string;
}

interface Candidate {
  postId: string;
  subreddit: string;
  title: string;
  selfText: string;
  url: string;
  score: number;
  createdUtc: number;
  matchReason: string;
}

interface Draft {
  postId: string;
  subreddit: string;
  postUrl: string;
  title: string;
  draftComment: string;
  approved: NullableApproval;
  createdAt: string;
  postedAt?: string;
  commentId?: string;
  error?: string;
}

function csv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function loadConfig(): Config {
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
    allowSubreddits: csv(process.env.ALLOW_SUBREDDITS ?? "smallbusiness"),
    searchKeywords: csv(
      process.env.SEARCH_KEYWORDS ?? "content marketing,lead generation"
    ),
    postsPerDay: Number.parseInt(process.env.POSTS_PER_DAY ?? "4", 10),
    discoveryLimitPerSub: Number.parseInt(
      process.env.DISCOVERY_LIMIT_PER_SUB ?? "20",
      10
    ),
    maxPostAgeHours: Number.parseInt(process.env.MAX_POST_AGE_HOURS ?? "24", 10),
    minScore: Number.parseInt(process.env.MIN_SCORE ?? "3", 10),
    queueDir: process.env.QUEUE_DIR ?? "queue",
    pendingFile: process.env.PENDING_FILE ?? "pending.json",
    postedFile: process.env.POSTED_FILE ?? "posted.json"
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function readQueue<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeQueue<T>(filePath: string, data: T[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function dedupeByPostId(items: Draft[]): Draft[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.postId)) {
      return false;
    }
    seen.add(item.postId);
    return true;
  });
}

function relevanceScore(text: string, keywords: string[]): { score: number; reason: string } {
  const lower = text.toLowerCase();
  const hits = keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
  return {
    score: hits.length,
    reason: hits.length > 0 ? `keyword matches: ${hits.slice(0, 5).join(", ")}` : "no keyword match"
  };
}

function qualityChecks(text: string): { ok: boolean; reason: string } {
  const words = text.trim().split(/\s+/);
  if (words.length < 60) {
    return { ok: false, reason: "too short" };
  }
  if (words.length > 220) {
    return { ok: false, reason: "too long" };
  }

  const banned = ["guaranteed", "best ever", "instant results", "dm me now"];
  const lower = text.toLowerCase();
  for (const phrase of banned) {
    if (lower.includes(phrase)) {
      return { ok: false, reason: `contains banned phrase: ${phrase}` };
    }
  }

  const links = text.match(/https?:\/\/\S+/g) ?? [];
  if (links.length > 1) {
    return { ok: false, reason: "too many links" };
  }

  return { ok: true, reason: "ok" };
}

function postedToday(items: Draft[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return items.filter((item) => item.postedAt?.slice(0, 10) === today).length;
}

function getReddit(config: Config): Snoowrap {
  return new Snoowrap({
    userAgent: config.redditUserAgent,
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    username: config.redditUsername,
    password: config.redditPassword
  });
}

function getOpenAi(config: Config): OpenAI {
  return new OpenAI({ apiKey: config.openAiApiKey });
}

async function discoverCandidates(config: Config, reddit: Snoowrap): Promise<Candidate[]> {
  const maxAgeMs = config.maxPostAgeHours * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const out: Candidate[] = [];

  for (const subName of config.allowSubreddits) {
    const subreddit = reddit.getSubreddit(subName);
    const listing = await subreddit.getNew({ limit: config.discoveryLimitPerSub });

    for (const post of listing as Submission[]) {
      const createdMs = post.created_utc * 1000;
      if (createdMs < cutoff) {
        continue;
      }

      const combined = `${post.title ?? ""}\n${post.selftext ?? ""}`;
      const { score, reason } = relevanceScore(combined, config.searchKeywords);
      if (score < config.minScore) {
        continue;
      }

      out.push({
        postId: post.id,
        subreddit: subName,
        title: post.title ?? "",
        selfText: post.selftext ?? "",
        url: `https://reddit.com${post.permalink}`,
        score,
        createdUtc: post.created_utc,
        matchReason: reason
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

async function generateComment(config: Config, client: OpenAI, candidate: Candidate): Promise<string> {
  const systemPrompt =
    "You write helpful, concise Reddit comments. Avoid spammy language. Prioritize practical advice. Mention the business URL only when directly relevant.";

  const userPrompt = `
Business:
- Name: ${config.businessName}
- URL: ${config.businessUrl}
- Description: ${config.businessDescription}

Target Reddit thread:
- Subreddit: r/${candidate.subreddit}
- Title: ${candidate.title}
- Body: ${candidate.selfText.slice(0, 1500)}
- URL: ${candidate.url}

Write ONE comment reply that:
1) Is genuinely helpful and specific to the post.
2) Uses a natural, non-sales tone.
3) Is 80-180 words.
4) Includes at most one soft CTA and at most one URL.
5) Mentions limitations honestly.
`.trim();

  const response = await client.responses.create({
    model: config.openAiModel,
    temperature: 0.7,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  return response.output_text?.trim() ?? "";
}

async function cmdDiscover(config: Config): Promise<void> {
  const reddit = getReddit(config);
  const ai = getOpenAi(config);

  const pendingPath = path.join(config.queueDir, config.pendingFile);
  const pending = readQueue<Draft>(pendingPath);

  const candidates = await discoverCandidates(config, reddit);
  let drafted = 0;

  for (const candidate of candidates) {
    if (pending.some((item) => item.postId === candidate.postId)) {
      continue;
    }

    const draftComment = await generateComment(config, ai, candidate);
    const qc = qualityChecks(draftComment);
    if (!qc.ok) {
      console.log(`skip ${candidate.postId}: ${qc.reason}`);
      continue;
    }

    pending.push({
      postId: candidate.postId,
      subreddit: candidate.subreddit,
      postUrl: candidate.url,
      title: candidate.title,
      draftComment,
      approved: null,
      createdAt: nowIso()
    });
    drafted += 1;
  }

  const merged = dedupeByPostId(pending);
  writeQueue(pendingPath, merged);
  console.log(`added ${drafted} draft(s), pending=${merged.length}`);
}

async function cmdPost(config: Config): Promise<void> {
  const reddit = getReddit(config);

  const pendingPath = path.join(config.queueDir, config.pendingFile);
  const postedPath = path.join(config.queueDir, config.postedFile);

  const pending = readQueue<Draft>(pendingPath);
  const posted = readQueue<Draft>(postedPath);

  const remaining = Math.max(config.postsPerDay - postedToday(posted), 0);
  if (remaining === 0) {
    console.log("daily cap reached");
    return;
  }

  let postedCount = 0;
  const nextPending: Draft[] = [];

  for (const item of pending) {
    if (postedCount >= remaining) {
      nextPending.push(item);
      continue;
    }

    if (item.approved !== true) {
      nextPending.push(item);
      continue;
    }

    try {
      const submission = reddit.getSubmission(item.postId);
      const comment = await submission.reply(item.draftComment);

      item.postedAt = nowIso();
      item.commentId = comment.id;
      posted.push(item);
      postedCount += 1;
      console.log(`posted: ${item.postId} -> ${comment.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      item.error = message;
      nextPending.push(item);
      console.log(`failed: ${item.postId} (${message})`);
    }
  }

  writeQueue(pendingPath, nextPending);
  writeQueue(postedPath, posted);
  console.log(`posted ${postedCount}, remaining cap=${remaining - postedCount}`);
}

function cmdStats(config: Config): void {
  const pending = readQueue<Draft>(path.join(config.queueDir, config.pendingFile));
  const posted = readQueue<Draft>(path.join(config.queueDir, config.postedFile));

  const approved = pending.filter((item) => item.approved === true).length;
  const rejected = pending.filter((item) => item.approved === false).length;
  const undecided = pending.filter((item) => item.approved === null).length;

  console.log(`pending total: ${pending.length}`);
  console.log(`  approved: ${approved}`);
  console.log(`  rejected: ${rejected}`);
  console.log(`  undecided: ${undecided}`);
  console.log(`posted total: ${posted.length}`);
  console.log(`posted today: ${postedToday(posted)} / ${config.postsPerDay}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!["discover", "post", "stats"].includes(command ?? "")) {
    console.log("Usage: node dist/bot.js <discover|post|stats>");
    process.exit(1);
  }

  const config = loadConfig();

  if (command === "discover") {
    await cmdDiscover(config);
    return;
  }

  if (command === "post") {
    await cmdPost(config);
    return;
  }

  cmdStats(config);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
