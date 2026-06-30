import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USEAPI_ROOT = 'https://api.useapi.net/v1/google-flow';

function jsonError(message: string, status = 400, raw?: unknown) {
  return NextResponse.json({ ok: false, message, raw }, { status });
}

function getEnv() {
  const token = process.env.USEAPI_TOKEN?.trim();
  const email = process.env.USEAPI_EMAIL?.trim();

  if (!token) throw new Error('Thiếu USEAPI_TOKEN trong Environment Variables.');
  return { token, email };
}

function extractJobId(result: any) {
  if (typeof result?.jobid === 'string') return result.jobid;
  if (typeof result?.jobId === 'string') return result.jobId;
  return '';
}

function normalizeVoice(voice: string) {
  if (voice.includes('Trung')) return 'giọng Trung Việt Nam';
  if (voice.includes('Nam')) return 'giọng Nam Việt Nam';
  return 'giọng Bắc Việt Nam';
}

function buildVideoPrompt(narration: string, voice: string, actionNote: string) {
  return [
    'Tạo video dọc 9:16 dài đúng 8 giây từ ảnh ghép đã có.',
    'Giữ nguyên nhân vật, khuôn mặt, trang phục, thần thái và bối cảnh bất động sản trong ảnh đầu vào.',
    `Nhân vật nói tiếng Việt tự nhiên theo đúng ${normalizeVoice(voice)} đã chọn, không tự đổi vùng miền.`,
    `Lời thoại: ${narration.trim()}`,
    actionNote ? `Hành động: ${actionNote.trim()}` : 'Chuyển động tự nhiên, biểu cảm thân thiện, ánh mắt nhìn camera.',
    'Không đổi người, không đổi mặt, không đổi bối cảnh, không thêm chữ, không watermark, không méo hình, không méo miệng.'
  ].join(' ');
}

export async function POST(request: NextRequest) {
  try {
    const { token, email } = getEnv();
    const body = await request.json();

    const startImage = body.startImage;
    const narration = String(body.narration || '').trim();
    const voice = String(body.voice || 'Giọng Bắc Việt Nam').trim();
    const actionNote = String(body.actionNote || '').trim();
    const requestedModel = String(body.model || 'veo-3.1-lite').trim();
    const model = ['veo-3.1-fast', 'veo-3.1-lite', 'veo-3.1-quality'].includes(requestedModel)
      ? requestedModel
      : 'veo-3.1-lite';

    if (!startImage) return jsonError('Thiếu ảnh ghép để tạo video.');
    if (!narration) return jsonError('Thiếu lời thoại cảnh.');

    const videoPayload: Record<string, unknown> = {
      email: email || undefined,
      prompt: buildVideoPrompt(narration, voice, actionNote),
      model,
      aspectRatio: 'portrait',
      duration: 8,
      count: 1,
      startImage,
      async: true,
      captchaRetry: 5
    };

    const videoResponse = await fetch(`${USEAPI_ROOT}/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(videoPayload)
    });

    const videoText = await videoResponse.text();
    let videoResult: any;
    try {
      videoResult = JSON.parse(videoText);
    } catch {
      videoResult = { rawText: videoText };
    }

    if (!videoResponse.ok) {
      return jsonError(`Tạo video cảnh lỗi HTTP ${videoResponse.status}.`, videoResponse.status, videoResult);
    }

    const jobId = extractJobId(videoResult);
    if (!jobId) {
      return jsonError('UseAPI đã phản hồi nhưng không thấy jobId/jobid.', 502, videoResult);
    }

    return NextResponse.json({ ok: true, jobId, raw: videoResult });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi tạo video cảnh.', 500);
  }
}
