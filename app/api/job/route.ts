import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USEAPI_ROOT = 'https://api.useapi.net/v1/google-flow';

function getVideoFromJob(job: any) {
  const media = job?.response?.media || job?.media || [];
  if (!Array.isArray(media) || media.length === 0) return { videoUrl: '', mediaGenerationId: '' };

  const firstWithUrl = media.find((item) => typeof item?.videoUrl === 'string') || media[0];
  return {
    videoUrl: typeof firstWithUrl?.videoUrl === 'string' ? firstWithUrl.videoUrl : '',
    mediaGenerationId: typeof firstWithUrl?.mediaGenerationId === 'string' ? firstWithUrl.mediaGenerationId : ''
  };
}

export async function GET(request: NextRequest) {
  const token = process.env.USEAPI_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Thiếu USEAPI_TOKEN trong Environment Variables.' }, { status: 500 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId')?.trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'Thiếu jobId.' }, { status: 400 });
  }

  const response = await fetch(`${USEAPI_ROOT}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  const text = await response.text();
  let job: any;
  try {
    job = JSON.parse(text);
  } catch {
    job = { rawText: text };
  }

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: `Kiểm tra job lỗi HTTP ${response.status}.`, raw: job }, { status: response.status });
  }

  const { videoUrl, mediaGenerationId } = getVideoFromJob(job);

  return NextResponse.json({
    ok: true,
    status: job.status || 'unknown',
    videoUrl,
    mediaGenerationId,
    error: job.error || job.errorDetails || '',
    raw: job
  });
}
