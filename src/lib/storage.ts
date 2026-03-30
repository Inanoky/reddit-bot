import fs from "node:fs";
import path from "node:path";

import { PostedRecord } from "./types";

const KV_KEY = "posted_records";
const LOCAL_FILE = path.join(process.cwd(), "src", "data", "posted.json");

async function readLocal(): Promise<PostedRecord[]> {
  if (!fs.existsSync(LOCAL_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")) as PostedRecord[];
  } catch {
    return [];
  }
}

function writeLocal(records: PostedRecord[]): void {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function kvClient(): Promise<{ get: Function; set: Function } | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }

  try {
    const mod = await import("@vercel/kv");
    return mod.kv as unknown as { get: Function; set: Function };
  } catch {
    return null;
  }
}

export async function getPostedRecords(): Promise<PostedRecord[]> {
  const kv = await kvClient();
  if (!kv) {
    return readLocal();
  }

  const data = await kv.get(KV_KEY);
  return Array.isArray(data) ? (data as PostedRecord[]) : [];
}

export async function addPostedRecord(record: PostedRecord): Promise<void> {
  const existing = await getPostedRecords();
  const merged = [record, ...existing].slice(0, 500);

  const kv = await kvClient();
  if (!kv) {
    writeLocal(merged);
    return;
  }

  await kv.set(KV_KEY, merged);
}
