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
      'Tạo ảnh bất động sản dọc 9:16 theo phong cách selfie chân thực.',
      'Dùng @reference_1 làm nhân vật chính và @reference_2 làm bối cảnh bất động sản gốc.',
      'Giữ nguyên tối đa khuôn mặt, thần thái, nhận diện, độ tuổi, giới tính, màu da và kiểu tóc của nhân vật.',
      'Giữ nguyên toàn bộ bất động sản trong ảnh gốc, gồm kiến trúc, bố cục, màu sắc, ánh sáng, chi tiết và không gian.',
      'Nhân vật xuất hiện khoảng 3/4 thân, gương mặt rõ nét, biểu cảm tự nhiên, mỉm cười nhẹ.',
      'Góc máy như chính nhân vật đang tự cầm điện thoại chụp cùng căn nhà.',
      'Ảnh chân thực như ảnh điện thoại ngoài đời, không biến dạng mặt, không đổi chi tiết căn nhà, không thêm vật thể lạ, không watermark, không chữ.',
      `Ngữ cảnh cảnh này: ${sceneNote}`
    ].join(' ');
  }

  return [
    'Tạo ảnh bất động sản dọc 9:16 theo phong cách tự nhiên như nhân viên môi giới đang giới thiệu căn nhà.',
    'Dùng @reference_1 làm nhân vật chính và @reference_2 làm bối cảnh bất động sản gốc.',
    'Giữ nguyên tối đa khuôn mặt, thần thái, nhận diện, độ tuổi, giới tính, màu da và kiểu tóc của nhân vật.',
    'Giữ nguyên mặt tiền, kiến trúc, bố cục, màu sơn, chi tiết ngoại thất, không gian và ánh sáng của bất động sản.',
    'Nhân vật xuất hiện full body toàn thân, đứng trọn vẹn trong khung hình, không cắt đầu, không cắt chân, tỷ lệ cơ thể cân đối.',
    'Dáng đứng tự nhiên, chuyên nghiệp, thân thiện, có thể đưa tay nhẹ về phía căn nhà như đang giới thiệu.',
    'Góc chụp như được người khác chụp bằng điện thoại hoặc ảnh quảng bá bất động sản đời thường.',
    'Không biến dạng gương mặt, không thay đổi chi tiết căn nhà, không thêm vật thể lạ, không studio, không watermark, không chữ.',
    `Ngữ cảnh cảnh này: ${sceneNote}`
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
