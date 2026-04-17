import { NextRequest, NextResponse } from "next/server";
import { loadAgentJobsBySlug, saveAgentJob } from "@/lib/jobs/job-manager";
import type { JobConfig } from "@/types/jobs";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import { normalizeJobConfig } from "@/lib/jobs/job-normalization";
import { HttpError } from "@/lib/http/create-handler";
import { assertValidSlug } from "@/lib/agents/persona/slug-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: slug } = await params;
  try {
    assertValidSlug(slug, "id");
    const jobs = await loadAgentJobsBySlug(slug);
    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: slug } = await params;
  try {
    assertValidSlug(slug, "id");
    const body = await req.json();
    const now = new Date().toISOString();
    const job: JobConfig = normalizeJobConfig(
      {
        ...body,
        createdAt: now,
        updatedAt: now,
      },
      slug,
      `job-${Date.now()}`
    );

    await saveAgentJob(slug, job);
    await reloadDaemonSchedules().catch(() => {});
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
