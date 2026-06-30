import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sceneTitles = [
  'Mở đầu thu hút',
  'Vị trí và diện tích',
  'Không gian công năng',
  'Pháp lý và giá trị',
  'Tiềm năng sở hữu',
  'Kêu gọi liên hệ'
];

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function limitWords(text: string, max = 26) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  return `${words.slice(0, max).join(' ')}.`;
}

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitContent(info: string, count: number) {
  const parts = info
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= count) return parts.slice(0, count);

  const words = info.split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(10, Math.ceil(words.length / count));
  const chunks: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const chunk = words.slice(i * chunkSize, (i + 1) * chunkSize).join(' ');
    chunks.push(chunk || info);
  }

  return chunks;
}

function buildNarration(index: number, total: number, infoPart: string) {
  const safe = infoPart.replace(/[:;]+/g, ',').trim();
  const templates = [
    `Đây là bất động sản rất đáng xem, nổi bật với ${safe}, phù hợp khách đang tìm nơi an cư hoặc đầu tư.`,
    `Điểm mạnh của căn này là ${safe}, giúp việc ở thực tế và khai thác giá trị đều thuận tiện hơn.`,
    `Không gian được giới thiệu ở cảnh này có ${safe}, tạo cảm giác thoáng, dễ dùng và phù hợp sinh hoạt gia đình.`,
    `Về giá trị sở hữu, căn nhà có ${safe}, đây là yếu tố quan trọng khi khách xuống tiền.`,
    `Nếu anh chị đang tìm lựa chọn bền vững, ${safe} là ưu điểm rất đáng cân nhắc.`,
    `Anh chị quan tâm căn này hãy liên hệ ngay để nhận thông tin chi tiết và sắp lịch xem nhà thực tế.`
  ];

  const text = templates[Math.min(index - 1, templates.length - 1)];
  const finalText = index === total && total < 6 ? templates[5] : text;
  return limitWords(finalText, 26);
}

function buildImagePrompt(style: string, sceneNote: string) {
  if (style === 'Selfie') {
    return [
      'Create a realistic smartphone selfie photo for real estate marketing.',
      'Use @reference_1 as the real estate background and keep the property recognizable.',
      'Use @reference_2 as the person reference in the foreground.',
      'The person appears about three-quarter body, smiling naturally, holding the phone like a real selfie.',
      'Keep the property architecture, color, lighting and layout natural in the background.',
      'Real phone photo style, natural daylight, friendly real estate consultant mood, vertical social video cover look.',
      'No text overlay, no watermark, no logo, no extra people, no strange objects.',
      `Scene context: ${sceneNote}`
    ].join(' ');
  }

  return [
    'Create a realistic real estate presentation photo.',
    'Use @reference_1 as the real estate location and keep the property recognizable.',
    'Use @reference_2 as the person reference standing naturally in the scene.',
    'The person appears as a friendly real estate consultant, full body visible, balanced proportion, not cropped head or feet.',
    'Keep the property architecture, layout, color, lighting and real details.',
    'Real phone photo style, natural daylight, not studio, professional everyday real estate marketing look, vertical social video cover look.',
    'No text overlay, no watermark, no logo, no extra people, no strange objects.',
    `Scene context: ${sceneNote}`
  ].join(' ');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const propertyText = cleanText(body.propertyText);
    const duration = Number(body.duration || 24);
    const mergeStyle = cleanText(body.mergeStyle || 'Selfie');
    const imageNames = Array.isArray(body.imageNames) ? body.imageNames.map(cleanText).filter(Boolean).slice(0, 6) : [];

    if (!propertyText) return jsonError('Thiếu thông tin bất động sản.');
    if (![24, 32, 40, 48].includes(duration)) return jsonError('Độ dài video không hợp lệ.');
    if (imageNames.length === 0) return jsonError('Thiếu ảnh bất động sản.');

    const sceneCount = duration / 8;
    const chunks = splitContent(propertyText, sceneCount);

    const scenes = Array.from({ length: sceneCount }).map((_, i) => {
      const index = i + 1;
      const imageIndex = imageNames.length >= sceneCount ? i : i % imageNames.length;
      const note = chunks[i] || propertyText;
      const narration = buildNarration(index, sceneCount, note);

      return {
        id: `scene-${Date.now()}-${index}`,
        index,
        title: sceneTitles[i] || `Cảnh ${index}`,
        propertyImageIndex: imageIndex,
        propertyImageName: imageNames[imageIndex] || `Ảnh ${imageIndex + 1}`,
        narration: countWords(narration) > 30 ? limitWords(narration, 26) : narration,
        imagePrompt: buildImagePrompt(mergeStyle, note),
        actionNote: index === sceneCount
          ? 'Nhân vật nhìn vào camera, biểu cảm tin cậy, kêu gọi liên hệ hoặc xem nhà.'
          : 'Nhân vật nhìn vào camera, cử động đầu và tay nhẹ nhàng, giới thiệu bất động sản tự nhiên.',
        status: 'Đã tạo phân cảnh'
      };
    });

    return NextResponse.json({ ok: true, scenes, raw: { sceneCount, duration, mergeStyle } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Lỗi tạo phân cảnh.', 500);
  }
}
