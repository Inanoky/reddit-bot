# WorksRecorded Reddit Bot (Vercel + TypeScript)

This project is a Vercel-ready Reddit bot that:
1. Runs every hour via Vercel Cron.
2. Finds relevant recent posts in selected subreddits.
3. Uses OpenAI to generate one helpful comment.
4. Posts **1 reply per hour**.
5. Logs what was posted and shows it in a simple web dashboard.

## Stack

- Next.js (App Router)
- Vercel Cron (`vercel.json`)
- Snoowrap (Reddit API)
- OpenAI API (Responses)
- Vercel KV (optional but recommended) for posted history

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Dashboard URL locally:
- `http://localhost:3000/`

Manual cron trigger locally:
- `http://localhost:3000/api/cron/reply?secret=YOUR_CRON_SECRET`

## Vercel deployment

1. Push this repository to GitHub.
2. Import project into Vercel.
3. Set environment variables from `.env.example`.
4. Ensure `CRON_SECRET` is set.
5. (Recommended) Attach Vercel KV and set `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

Cron schedule is configured in `vercel.json`:
- `0 * * * *` => once every hour.

## Routes

- `/` → Dashboard showing AI-posted comments and target subreddit/post.
- `/api/cron/reply` → Cron endpoint that posts one AI reply each run.
- `/api/posted` → JSON endpoint for posted history.

## Safety guidance

- Keep `ALLOW_SUBREDDITS` limited to communities where self-promotion is allowed.
- Keep content genuinely useful and not repetitive.
- Monitor dashboard regularly.

## Notes on persistence

- In production, use Vercel KV for reliable storage.
- Without KV, local file fallback (`src/data/posted.json`) is used for development only.
