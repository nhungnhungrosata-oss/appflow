import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USEAPI_ROOT = 'https://api.useapi.net/v1/google-flow';
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type ImageModel = 'nano-banana-2' | 'imagen-4';

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

function normalizePrompt(prompt: string) {
  return prompt
    .replace(/@reference_2/gi, '@character_1')
    .replace(/Use @character_1 as the person reference/gi, 'Use @character_1 as the advisor reference')
    .replace(/giữ nguyên tối đa/gi, 'keep the same general look of')
    .replace(/nhận diện/gi, 'appearance')
    .replace(/tuyệt đối/gi, '')
    .replace(/không được/gi, 'avoid')
    .replace(/Không/gi, 'Avoid')
    .replace(/không/gi, 'avoid')
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

async function createFlowCharacter(token: string, portraitId: string) {
  const response = await fetch(`${USEAPI_ROOT}/characters`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      displayName: `Real Estate Advisor ${Date.now()}`,
      imageReference_1: portraitId,
      personalityNotes: 'Friendly professional real estate advisor.'
    })
  });

  const text = await response.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    result = { rawText: text };
  }

  if (!response.ok || typeof result?.character !== 'string') {
    return { ok: false, status: response.status, result, character: '' };
  }

  return { ok: true, status: response.status, result, character: result.character as string };
}

async function callImageGeneration(args: {
  token: string;
  prompt: string;
  model: ImageModel;
  aspectRatio: '9:16' | 'auto';
  propertyId: string;
  characterRef?: string;
  portraitId: string;
  label: string;
}) {
  const body: Record<string, unknown> = {
    model: args.model,
    prompt: args.prompt,
    aspectRatio: args.aspectRatio,
    count: 1,
    reference_1: args.propertyId,
    captchaRetry: 5
  };

  if (args.characterRef) {
    body.character_1 = args.characterRef;
  } else {
    body.reference_2 = args.portraitId;
  }

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

  return { ok: response.ok, status: response.status, result, model: args.model, aspectRatio: args.aspectRatio, label: args.label };
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
    const characterAttempt = await createFlowCharacter(token, portraitUpload.mediaGenerationId);

    const prompt = normalizePrompt(imagePrompt);
    const attempts = [];
    const attemptConfigs: Array<{ model: ImageModel; aspectRatio: '9:16' | 'auto'; label: string; useCharacter: boolean }> = [
      { model: 'nano-banana-2', aspectRatio: 'auto', label: 'character nano-banana-2 auto', useCharacter: true },
      { model: 'nano-banana-2', aspectRatio: '9:16', label: 'character nano-banana-2 9:16', useCharacter: true },
      { model: 'imagen-4', aspectRatio: '9:16', label: 'character imagen-4 9:16', useCharacter: true },
      { model: 'nano-banana-2', aspectRatio: 'auto', label: 'raw reference nano-banana-2 auto', useCharacter: false }
    ];

    let finalAttempt: Awaited<ReturnType<typeof callImageGeneration>> | null = null;

    for (const config of attemptConfigs) {
      if (config.useCharacter && !characterAttempt.ok) continue;

      const attempt = await callImageGeneration({
        token,
        prompt,
        model: config.model,
        aspectRatio: config.aspectRatio,
        propertyId: propertyUpload.mediaGenerationId,
        portraitId: portraitUpload.mediaGenerationId,
        characterRef: config.useCharacter ? characterAttempt.character : undefined,
        label: config.label
      });

      attempts.push(attempt);
      if (attempt.ok) {
        finalAttempt = attempt;
        break;
      }

      if (![400, 429, 500, 503].includes(attempt.status)) {
        break;
      }
    }

    if (!finalAttempt) {
      const last = attempts[attempts.length - 1];
      return jsonError(
        `Tạo ảnh ghép lỗi HTTP ${last?.status || 500}. Đã thử ${attempts.map((item) => item.label).join(', ')}.`,
        last?.status || 500,
        { attempts, characterAttempt, portraitUpload: portraitUpload.raw, propertyUpload: propertyUpload.raw }
      );
    }

    const generated = extractGeneratedImage(finalAttempt.result);
    if (!generated.mediaGenerationId) {
      return jsonError('Tạo ảnh ghép xong nhưng không lấy được mediaGenerationId.', 502, {
        attempts,
        characterAttempt,
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
        aspectRatioUsed: finalAttempt.aspectRatio,
        referenceMode: characterAttempt.ok ? 'character_1 plus reference_1' : 'raw references',
        attempts,
        characterAttempt,
        portraitUpload: portraitUpload.raw,
        propertyUpload: propertyUpload.raw,
        imageResult: finalAttempt.result
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi tạo ảnh ghép.', 500);
  }
}
