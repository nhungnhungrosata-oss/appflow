import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USEAPI_ROOT = 'https://api.useapi.net/v1/google-flow';

type ConcatRequestBody = {
  mediaGenerationIds?: unknown;
};

function jsonError(message: string, status = 400, raw?: unknown) {
  return NextResponse.json({ ok: false, message, raw }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const token = process.env.USEAPI_TOKEN?.trim();
    if (!token) throw new Error('Thiếu USEAPI_TOKEN trong Environment Variables.');

    const body = (await request.json()) as ConcatRequestBody;
    const ids: string[] = Array.isArray(body.mediaGenerationIds)
      ? body.mediaGenerationIds
          .map((id: unknown) => String(id || '').trim())
          .filter((id: string) => Boolean(id))
      : [];

    if (ids.length < 2) return jsonError('Cần ít nhất 2 video cảnh để ghép.');
    if (ids.length > 10) return jsonError('Chỉ hỗ trợ ghép tối đa 10 video.');

    const concatResponse = await fetch(`${USEAPI_ROOT}/videos/concatenate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        media: ids.map((mediaGenerationId: string) => ({ mediaGenerationId }))
      })
    });

    const concatText = await concatResponse.text();
    let concatResult: any;
    try {
      concatResult = JSON.parse(concatText);
    } catch {
      concatResult = { rawText: concatText };
    }

    if (!concatResponse.ok) {
      return jsonError(`Ghép video lỗi HTTP ${concatResponse.status}.`, concatResponse.status, concatResult);
    }

    if (!concatResult?.encodedVideo) {
      return jsonError('Ghép video xong nhưng không có encodedVideo.', 502, concatResult);
    }

    return NextResponse.json({
      ok: true,
      encodedVideo: concatResult.encodedVideo,
      raw: {
        jobId: concatResult.jobId,
        status: concatResult.status,
        inputsCount: concatResult.inputsCount
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi ghép video.', 500);
  }
}
