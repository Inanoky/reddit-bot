import { NextResponse } from "next/server";

import { getPostedRecords } from "@/lib/storage";

export async function GET() {
  const records = await getPostedRecords();
  return NextResponse.json({ ok: true, records });
}
