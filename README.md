# Reddit Promotion Assistant Bot (TypeScript)

A **safety-first TypeScript Reddit bot** that helps promote `worksrecorded.com` by generating helpful comments for relevant threads using the OpenAI API.

This version is intentionally designed to reduce spam risk:
- human approval required before posting,
- strict cap of 4 comments/day,
- subreddit allowlist only,
- quality guardrails and dedupe logic,
- non-sales prompting style.

## Features

- `discover`: find recent matching posts + generate comment drafts.
- `post`: post only approved drafts (daily cap enforced).
- `stats`: view queue and posting status.

## Quick start

### 1) Install deps

```bash
npm install
```

### 2) Configure env

```bash
cp .env.example .env
# fill in Reddit/OpenAI credentials
```

### 3) Build

```bash
npm run build
```

### 4) Generate drafts

```bash
npm run discover
```

### 5) Review pending queue

Edit `queue/pending.json` and set:
- `"approved": true` to allow posting
- `"approved": false` to reject

### 6) Post approved drafts

```bash
npm run post
```

## Configuration

Set these in `.env`:
- `BUSINESS_URL=https://worksrecorded.com`
- `POSTS_PER_DAY=4`
- `ALLOW_SUBREDDITS=...`
- `SEARCH_KEYWORDS=...`

## Responsible use

Follow Reddit site rules and each subreddit’s self-promotion policy. Use this tool for genuine, useful participation.
