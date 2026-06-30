import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USEAPI_ROOT = 'https://api.useapi.net/v1/google-flow';
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function jsonError(message: string, status = 400, raw?: unknown) {
  return NextResponse.json({ ok: false, message, raw }, { status });
}

function getEnv() {
  const token = process.env.USEAPI_TOKEN?.trim();
  const email = process.env.USEAPI_EMAIL?.trim();

  if (!token) throw new Error('Thiếu USEAPI_TOKEN trong Environment Variables.');
  return { token, email };
}

function extractAssetMediaGenerationId(result: any) {
  const value = result?.mediaGenerationId;
  if (typeof value === 'string') return value;
  if (typeof value?.mediaGenerationId === 'string') return value.mediaGenerationId;
  if (typeof value?.referenceId === 'string') return value.referenceId;
  return '';
}

function extractGeneratedImage(result: any) {
  const media = Array.isArray(result?.media) ? result.media[0] : null;
  const generatedImage = media?.image?.generatedImage || {};
  const mediaGenerationId =
    generatedImage?.mediaGenerationId ||
    media?.mediaGenerationId ||
    media?.mediaMetadata?.mediaGenerationId ||
    '';
  const imageUrl =
    generatedImage?.fifeUrl ||
    generatedImage?.imageUrl ||
    generatedImage?.url ||
    media?.imageUrl ||
    media?.url ||
    '';

  return { mediaGenerationId, imageUrl };
}

function softenPrompt(prompt: string) {
  return prompt
    .replace(/tuyệt đối/gi, '')
    .replace(/không được/gi, 'tránh')
    .replace(/nhận diện/gi, 'đặc điểm gương mặt')
    .replace(/giữ nguyên tối đa/gi, 'giữ gần giống')
    .replace(/Không/gi, 'Tránh')
    .replace(/không/gi, 'tránh')
    .replace(/\s+/g, ' ')
    .trim();
}

async function uploadImage(file: File, token: string, email?: string) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Ảnh phải là PNG, JPG hoặc WEBP.');
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Ảnh vượt quá 4MB. Vui lòng nén ảnh nhẹ hơn rồi thử lại.');
  }

  const url = email ? `${USEAPI_ROOT}/assets/${encodeURIComponent(email)}` : `${USEAPI_ROOT}/assets`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type
    },
    body: Buffer.from(await file.arrayBuffer())
  });

  const text = await response.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    result = { rawText: text };
  }

  if (!response.ok) {
    throw new Error(`Upload ảnh lỗi HTTP ${response.status}: ${result?.error || result?.message || 'Không rõ lỗi.'}`);
  }

  const mediaGenerationId = extractAssetMediaGenerationId(result);
  if (!mediaGenerationId) {
    throw new Error('Upload ảnh thành công nhưng không lấy được mediaGenerationId.');
  }

  return { mediaGenerationId, raw: result };
}

async function callImageGeneration(args: {
  token: string;
  email?: string;
  prompt: string;
  model: 'nano-banana-2' | 'imagen-4';
  portraitId: string;
  propertyId: string;
}) {
  const body = {
    email: args.email || undefined,
    model: args.model,
    prompt: args.prompt,
    aspectRatio: '9:16',
    count: 1,
    reference_1: args.portraitId,
    reference_2: args.propertyId,
    captchaRetry: 5
  };

  const response = await fetch(`${USEAPI_ROOT}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    result = { rawText: text };
  }

  return { ok: response.ok, status: response.status, result, model: args.model };
}

export async function POST(request: NextRequest) {
  try {
    const { token, email } = getEnv();
    const formData = await request.formData();

    const portrait = formData.get('portrait');
    const propertyImage = formData.get('propertyImage');
    const imagePrompt = String(formData.get('imagePrompt') || '').trim();
    const mergeStyle = String(formData.get('mergeStyle') || 'Selfie').trim();

    if (!portrait || typeof portrait === 'string') return jsonError('Thiếu ảnh chân dung nhân vật.');
    if (!propertyImage || typeof propertyImage === 'string') return jsonError('Thiếu ảnh bất động sản.');
    if (!imagePrompt) return jsonError('Thiếu prompt ghép ảnh.');

    const portraitUpload = await uploadImage(portrait, token, email);
    const propertyUpload = await uploadImage(propertyImage, token, email);

    const attempts = [];
    const firstAttempt = await callImageGeneration({
      token,
      email,
      prompt: imagePrompt,
      model: 'nano-banana-2',
      portraitId: portraitUpload.mediaGenerationId,
      propertyId: propertyUpload.mediaGenerationId
    });
    attempts.push(firstAttempt);

    let finalAttempt = firstAttempt;

    if (!firstAttempt.ok && [400, 500, 503].includes(firstAttempt.status)) {
      const fallbackAttempt = await callImageGeneration({
        token,
        email,
        prompt: softenPrompt(imagePrompt),
        model: 'imagen-4',
        portraitId: portraitUpload.mediaGenerationId,
        propertyId: propertyUpload.mediaGenerationId
      });
      attempts.push(fallbackAttempt);
      finalAttempt = fallbackAttempt.ok ? fallbackAttempt : firstAttempt;
    }

    if (!finalAttempt.ok) {
      return jsonError(
        `Tạo ảnh ghép lỗi HTTP ${finalAttempt.status}. Đã thử nano-banana-2${attempts.length > 1 ? ' và fallback imagen-4' : ''}.`,
        finalAttempt.status,
        { attempts, portraitUpload: portraitUpload.raw, propertyUpload: propertyUpload.raw }
      );
    }

    const generated = extractGeneratedImage(finalAttempt.result);
    if (!generated.mediaGenerationId) {
      return jsonError('Tạo ảnh ghép xong nhưng không lấy được mediaGenerationId.', 502, {
        attempts,
        portraitUpload: portraitUpload.raw,
        propertyUpload: propertyUpload.raw
      });
    }

    return NextResponse.json({
      ok: true,
      imageUrl: generated.imageUrl,
      mediaGenerationId: generated.mediaGenerationId,
      raw: {
        mergeStyle,
        modelUsed: finalAttempt.model,
        attempts,
        portraitUpload: portraitUpload.raw,
        propertyUpload: propertyUpload.raw,
        imageResult: finalAttempt.result
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi tạo ảnh ghép.', 500);
  }
}
