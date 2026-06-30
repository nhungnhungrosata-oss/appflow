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

    const body = {
      email: email || undefined,
      model: 'nano-banana-2',
      prompt: imagePrompt,
      aspectRatio: '9:16',
      count: 1,
      reference_1: portraitUpload.mediaGenerationId,
      reference_2: propertyUpload.mediaGenerationId,
      captchaRetry: 5
    };

    const imageResponse = await fetch(`${USEAPI_ROOT}/images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const imageText = await imageResponse.text();
    let imageResult: any;
    try {
      imageResult = JSON.parse(imageText);
    } catch {
      imageResult = { rawText: imageText };
    }

    if (!imageResponse.ok) {
      return jsonError(`Tạo ảnh ghép lỗi HTTP ${imageResponse.status}.`, imageResponse.status, imageResult);
    }

    const generated = extractGeneratedImage(imageResult);
    if (!generated.mediaGenerationId) {
      return jsonError('Tạo ảnh ghép xong nhưng không lấy được mediaGenerationId.', 502, imageResult);
    }

    return NextResponse.json({
      ok: true,
      imageUrl: generated.imageUrl,
      mediaGenerationId: generated.mediaGenerationId,
      raw: {
        mergeStyle,
        portraitUpload: portraitUpload.raw,
        propertyUpload: propertyUpload.raw,
        imageResult
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi tạo ảnh ghép.', 500);
  }
}
