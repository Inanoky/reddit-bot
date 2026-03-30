import OpenAI from "openai";
import Snoowrap, { Submission } from "snoowrap";

import { loadConfig } from "./config";
import { addPostedRecord, getPostedRecords } from "./storage";
import { Candidate, PostedRecord } from "./types";

function relevanceScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k.toLowerCase())).length;
}

function qualityChecks(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 60 || words.length > 220) {
    return false;
  }

  const links = text.match(/https?:\/\/\S+/g) ?? [];
  if (links.length > 1) {
    return false;
  }

  const banned = ["guaranteed", "best ever", "instant results", "dm me now"];
  const lower = text.toLowerCase();
  return !banned.some((phrase) => lower.includes(phrase));
}

function createClients() {
  const cfg = loadConfig();
  const reddit = new Snoowrap({
    userAgent: cfg.redditUserAgent,
    clientId: cfg.redditClientId,
    clientSecret: cfg.redditClientSecret,
    username: cfg.redditUsername,
    password: cfg.redditPassword
  });

  const openai = new OpenAI({ apiKey: cfg.openAiApiKey });
  return { cfg, reddit, openai };
}

async function discoverOneCandidate(): Promise<Candidate | null> {
  const { cfg, reddit } = createClients();
  const cutoff = Date.now() - cfg.maxPostAgeHours * 60 * 60 * 1000;
  const posted = await getPostedRecords();
  const postedIds = new Set(posted.map((item) => item.postId));

  const candidates: Candidate[] = [];

  for (const subName of cfg.allowSubreddits) {
    const subreddit = reddit.getSubreddit(subName);
    const listing = await subreddit.getNew({ limit: 25 });

    for (const post of listing as Submission[]) {
      if (postedIds.has(post.id)) {
        continue;
      }

      const createdMs = post.created_utc * 1000;
      if (createdMs < cutoff) {
        continue;
      }

      const combined = `${post.title ?? ""}\n${post.selftext ?? ""}`;
      const score = relevanceScore(combined, cfg.searchKeywords);
      if (score < cfg.minScore) {
        continue;
      }

      candidates.push({
        postId: post.id,
        subreddit: subName,
        title: post.title ?? "",
        selfText: post.selftext ?? "",
        url: `https://reddit.com${post.permalink}`,
        score
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => b.score - a.score)[0];
}

async function generateComment(candidate: Candidate): Promise<string> {
  const { cfg, openai } = createClients();

  const response = await openai.responses.create({
    model: cfg.openAiModel,
    temperature: 0.7,
    input: [
      {
        role: "system",
        content:
          "You write helpful, concise Reddit comments. Avoid spammy language and over-promotion."
      },
      {
        role: "user",
        content: `
Business:
- Name: ${cfg.businessName}
- URL: ${cfg.businessUrl}
- Description: ${cfg.businessDescription}

Thread:
- Subreddit: r/${candidate.subreddit}
- Title: ${candidate.title}
- Body: ${candidate.selfText.slice(0, 1500)}
- URL: ${candidate.url}

Write one helpful reply (80-180 words), no hard sell, and at most one URL.
        `.trim()
      }
    ]
  });

  return response.output_text?.trim() ?? "";
}

async function postComment(postId: string, body: string): Promise<{ commentId: string }> {
  const { reddit } = createClients();
  const submission = reddit.getSubmission(postId);
  const comment = await submission.reply(body);
  return { commentId: comment.id };
}

export async function runHourlyReplyJob(): Promise<{
  status: "posted" | "skipped";
  reason?: string;
  record?: PostedRecord;
}> {
  const candidate = await discoverOneCandidate();
  if (!candidate) {
    return { status: "skipped", reason: "No relevant candidate found." };
  }

  const draft = await generateComment(candidate);
  if (!qualityChecks(draft)) {
    return { status: "skipped", reason: "AI draft failed quality checks." };
  }

  const result = await postComment(candidate.postId, draft);
  const record: PostedRecord = {
    postId: candidate.postId,
    subreddit: candidate.subreddit,
    postTitle: candidate.title,
    postUrl: candidate.url,
    commentId: result.commentId,
    commentBody: draft,
    postedAt: new Date().toISOString()
  };

  await addPostedRecord(record);
  return { status: "posted", record };
}
