'use client';

import { ChangeEvent, useMemo, useState } from 'react';

type VoiceOption = 'Giọng Bắc Việt Nam' | 'Giọng Trung Việt Nam' | 'Giọng Nam Việt Nam';
type MergeStyle = 'Selfie' | 'Tự nhiên';

type Scene = {
  id: string;
  index: number;
  title: string;
  propertyImageIndex: number;
  propertyImageName: string;
  narration: string;
  imagePrompt: string;
  actionNote: string;
  imageUrl?: string;
  imageMediaGenerationId?: string;
  videoJobId?: string;
  videoUrl?: string;
  videoMediaGenerationId?: string;
  status?: string;
  error?: string;
  raw?: unknown;
};

type ApiResponse<T> = T & {
  ok: boolean;
  message?: string;
  error?: string;
  raw?: unknown;
};

type JobResponse = {
  ok: boolean;
  status?: string;
  videoUrl?: string;
  mediaGenerationId?: string;
  error?: string;
  raw?: unknown;
};

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const durations = [24, 32, 40, 48];
const voices: VoiceOption[] = ['Giọng Bắc Việt Nam', 'Giọng Trung Việt Nam', 'Giọng Nam Việt Nam'];
const mergeStyles: MergeStyle[] = ['Selfie', 'Tự nhiên'];

const demoText =
  'Nhà mặt tiền khu dân cư yên tĩnh, diện tích 80m2, pháp lý rõ ràng, 3 phòng ngủ, phòng khách rộng, gần chợ và trường học, phù hợp gia đình trẻ hoặc đầu tư cho thuê. Liên hệ để xem nhà thực tế.';

function countVietnameseWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isNarrationTooLong(value: string) {
  return countVietnameseWords(value) > 30;
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function readResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (contentType.includes('application/json')) {
    return JSON.parse(text || '{}') as ApiResponse<T>;
  }

  return {
    ok: false,
    message: text || `Request failed with HTTP ${res.status}`,
    error: text || `Request failed with HTTP ${res.status}`,
    raw: { rawText: text, status: res.status, statusText: res.statusText }
  } as ApiResponse<T>;
}

export default function HomePage() {
  const [portrait, setPortrait] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState('');
  const [propertyImages, setPropertyImages] = useState<File[]>([]);
  const [propertyPreviews, setPropertyPreviews] = useState<string[]>([]);
  const [propertyText, setPropertyText] = useState(demoText);
  const [voice, setVoice] = useState<VoiceOption>('Giọng Bắc Việt Nam');
  const [mergeStyle, setMergeStyle] = useState<MergeStyle>('Selfie');
  const [duration, setDuration] = useState(24);
  const [model, setModel] = useState('veo-3.1-lite');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState('Chưa tạo phân cảnh');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<unknown>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState('');

  const expectedScenes = useMemo(() => duration / 8, [duration]);
  const allImagesReady = scenes.length > 0 && scenes.every((scene) => scene.imageMediaGenerationId);
  const hasLongNarration = scenes.some((scene) => isNarrationTooLong(scene.narration));

  function setScenePatch(id: string, patch: Partial<Scene>) {
    setScenes((current) => current.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)));
  }

  function handlePortraitChange(file: File | null) {
    setError('');
    setPortrait(null);
    setPortraitPreview('');

    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError(`Ảnh chân dung đang là ${formatFileSize(file.size)}. Vui lòng nén ảnh dưới 4MB.`);
      return;
    }

    setPortrait(file);
    setPortraitPreview(URL.createObjectURL(file));
  }

  function handlePropertyImagesChange(event: ChangeEvent<HTMLInputElement>) {
    setError('');
    const files = Array.from(event.target.files || []).slice(0, 6);

    const invalid = files.find((file) => file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError(`Ảnh bất động sản "${invalid.name}" đang là ${formatFileSize(invalid.size)}. Vui lòng nén ảnh dưới 4MB.`);
      return;
    }

    setPropertyImages(files);
    setPropertyPreviews(files.map((file) => URL.createObjectURL(file)));
    setScenes([]);
    setFinalVideoUrl('');
  }

  async function generateCompositeImage(scene: Scene, currentScenes = scenes) {
    if (!portrait) throw new Error('Thiếu ảnh chân dung nhân vật.');
    const propertyImage = propertyImages[scene.propertyImageIndex] || propertyImages[0];
    if (!propertyImage) throw new Error('Thiếu ảnh bất động sản cho cảnh này.');

    setScenePatch(scene.id, { status: `Đang tạo ảnh ghép cảnh ${scene.index}...`, error: '' });

    const formData = new FormData();
    formData.append('portrait', portrait);
    formData.append('propertyImage', propertyImage);
    formData.append('mergeStyle', mergeStyle);
    formData.append('imagePrompt', scene.imagePrompt);
    formData.append('sceneIndex', String(scene.index));

    const res = await fetch('/api/real-estate/image', { method: 'POST', body: formData });
    const data = await readResponse<{ imageUrl: string; mediaGenerationId: string }>(res);
    setRaw(data.raw ?? data);

    if (!res.ok || !data.ok || !data.mediaGenerationId) {
      throw new Error(data.message || data.error || `Tạo ảnh cảnh ${scene.index} lỗi.`);
    }

    const updated = {
      imageUrl: data.imageUrl,
      imageMediaGenerationId: data.mediaGenerationId,
      status: `Đã tạo ảnh ghép cảnh ${scene.index}`,
      error: '',
      raw: data.raw ?? data
    };

    if (currentScenes.length) {
      setScenes((list) => list.map((item) => (item.id === scene.id ? { ...item, ...updated } : item)));
    }

    return { ...scene, ...updated };
  }

  async function handleCreateScenes() {
    setError('');
    setFinalVideoUrl('');

    if (!portrait) {
      setError('Vui lòng upload 1 ảnh chân dung nhân vật.');
      return;
    }

    if (propertyImages.length === 0) {
      setError('Vui lòng upload ít nhất 1 ảnh bất động sản, tối đa 6 ảnh.');
      return;
    }

    if (!propertyText.trim()) {
      setError('Vui lòng nhập thông tin bất động sản.');
      return;
    }

    setBusy(true);
    setStatus(`Đang tạo ${expectedScenes} phân cảnh...`);

    try {
      const res = await fetch('/api/real-estate/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyText,
          duration,
          voice,
          mergeStyle,
          imageNames: propertyImages.map((file) => file.name)
        })
      });

      const data = await readResponse<{ scenes: Scene[] }>(res);
      setRaw(data.raw ?? data);

      if (!res.ok || !data.ok || !Array.isArray(data.scenes)) {
        throw new Error(data.message || data.error || 'Không tạo được phân cảnh.');
      }

      setScenes(data.scenes);
      setStatus('Đã tạo phân cảnh. Đang tạo ảnh ghép từng cảnh...');

      let workingScenes = data.scenes;
      for (const scene of data.scenes) {
        const result = await generateCompositeImage(scene, workingScenes);
        workingScenes = workingScenes.map((item) => (item.id === scene.id ? result : item));
      }

      setStatus('Đã tạo đủ phân cảnh và ảnh ghép. Có thể sửa lời thoại rồi tạo tất cả video.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
      setStatus('Lỗi');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerateImage(scene: Scene) {
    setError('');
    setBusy(true);

    try {
      await generateCompositeImage(scene);
      setStatus(`Đã tạo lại ảnh cảnh ${scene.index}.`);
    } catch (err) {
      setScenePatch(scene.id, { error: err instanceof Error ? err.message : 'Tạo lại ảnh lỗi.', status: 'Lỗi ảnh' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerateNarration(scene: Scene) {
    setError('');
    setBusy(true);

    try {
      const res = await fetch('/api/real-estate/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyText, duration, voice, mergeStyle, imageNames: propertyImages.map((file) => file.name) })
      });
      const data = await readResponse<{ scenes: Scene[] }>(res);
      const replacement = data.scenes?.[scene.index - 1];

      if (!res.ok || !data.ok || !replacement) {
        throw new Error(data.message || data.error || 'Không tạo lại được lời thoại.');
      }

      setScenePatch(scene.id, { narration: replacement.narration, actionNote: replacement.actionNote, status: 'Đã tạo lại lời thoại' });
    } catch (err) {
      setScenePatch(scene.id, { error: err instanceof Error ? err.message : 'Tạo lại lời thoại lỗi.' });
    } finally {
      setBusy(false);
    }
  }

  async function pollVideoJob(scene: Scene, jobId: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const res = await fetch(`/api/job?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const data = await readResponse<JobResponse>(res);
      setRaw(data.raw ?? data);

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Không kiểm tra được job cảnh ${scene.index}.`);
      }

      setScenePatch(scene.id, { status: `Cảnh ${scene.index}: ${data.status || 'đang xử lý'}`, raw: data.raw ?? data });

      if (data.status === 'completed' && data.videoUrl && data.mediaGenerationId) {
        const patch = {
          videoUrl: data.videoUrl,
          videoMediaGenerationId: data.mediaGenerationId,
          status: `Hoàn thành video cảnh ${scene.index}`,
          error: ''
        };
        setScenePatch(scene.id, patch);
        return patch;
      }

      if (data.status === 'failed') {
        throw new Error(data.error || `Tạo video cảnh ${scene.index} thất bại.`);
      }

      await new Promise((resolve) => window.setTimeout(resolve, 7000));
    }

    throw new Error(`Video cảnh ${scene.index} xử lý quá lâu, vui lòng kiểm tra lại job.`);
  }

  async function createVideoForScene(scene: Scene) {
    if (!scene.imageMediaGenerationId) {
      throw new Error(`Cảnh ${scene.index} chưa có ảnh ghép.`);
    }

    if (isNarrationTooLong(scene.narration)) {
      throw new Error(`Lời thoại cảnh ${scene.index} đang vượt quá 8 giây, vui lòng rút ngắn nội dung.`);
    }

    setScenePatch(scene.id, { status: `Đang tạo video cảnh ${scene.index}...`, error: '' });

    const res = await fetch('/api/real-estate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startImage: scene.imageMediaGenerationId,
        narration: scene.narration,
        voice,
        actionNote: scene.actionNote,
        model
      })
    });

    const data = await readResponse<{ jobId: string }>(res);
    setRaw(data.raw ?? data);

    if (!res.ok || !data.ok || !data.jobId) {
      throw new Error(data.message || data.error || `Không tạo được job video cảnh ${scene.index}.`);
    }

    setScenePatch(scene.id, { videoJobId: data.jobId, status: `Đã gửi job video cảnh ${scene.index}` });
    return pollVideoJob(scene, data.jobId);
  }

  async function handleCreateAllVideos() {
    setError('');
    setFinalVideoUrl('');

    if (!allImagesReady) {
      setError('Cần có đủ ảnh ghép cho tất cả cảnh trước khi tạo video.');
      return;
    }

    if (hasLongNarration) {
      setError('Có lời thoại đang vượt quá 8 giây, vui lòng rút ngắn trước khi tạo video.');
      return;
    }

    setBusy(true);

    try {
      const videoIds: string[] = [];

      for (const scene of scenes) {
        setStatus(`Đang tạo video cảnh ${scene.index}/${scenes.length}`);
        const result = await createVideoForScene(scene);
        if (!result.videoMediaGenerationId) throw new Error(`Không lấy được mediaGenerationId video cảnh ${scene.index}.`);
        videoIds.push(result.videoMediaGenerationId);
      }

      setStatus('Đang ghép video hoàn chỉnh...');
      const res = await fetch('/api/real-estate/concat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaGenerationIds: videoIds })
      });

      const data = await readResponse<{ encodedVideo: string }>(res);
      setRaw(data.raw ?? data);

      if (!res.ok || !data.ok || !data.encodedVideo) {
        throw new Error(data.message || data.error || 'Ghép video hoàn chỉnh lỗi.');
      }

      setFinalVideoUrl(`data:video/mp4;base64,${data.encodedVideo}`);
      setStatus('Đã ghép xong video hoàn chỉnh.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
      setStatus('Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <section className="hero">
        <span className="badge">Google Flow qua UseAPI · Bất động sản · 9:16</span>
        <h1>Tạo Video Bất Động Sản AI</h1>
        <p>
          Upload ảnh nhân vật, tối đa 6 ảnh bất động sản, nhập thông tin căn nhà. App tự chia cảnh 8 giây, tạo ảnh ghép,
          tạo video từng cảnh và ghép thành video hoàn chỉnh.
        </p>
      </section>

      <section className="grid realestate-grid">
        <form className="card form-card" onSubmit={(event) => event.preventDefault()}>
          <h2>1. Đầu vào</h2>

          <div className="field">
            <label>Ảnh chân dung nhân vật</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handlePortraitChange(event.target.files?.[0] ?? null)} />
            <div className="helper">Ảnh này là ảnh tham chiếu bắt buộc. Nên dùng ảnh rõ mặt, ánh sáng tốt, dưới 4MB.</div>
            {portraitPreview && (
              <div className="preview small-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portraitPreview} alt="Ảnh chân dung" />
              </div>
            )}
          </div>

          <div className="field">
            <label>Ảnh bất động sản, tối đa 6 ảnh</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handlePropertyImagesChange} />
            <div className="helper">Mặt tiền, phòng khách, phòng ngủ, bếp, sân vườn, đường trước nhà hoặc tiện ích.</div>
            {propertyPreviews.length > 0 && (
              <div className="thumb-grid">
                {propertyPreviews.map((src, index) => (
                  <div className="thumb" key={src}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Ảnh BĐS ${index + 1}`} />
                    <span>{index + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label>Thông tin bất động sản</label>
            <textarea value={propertyText} onChange={(event) => setPropertyText(event.target.value)} />
            <div className="helper">Có thể nhập vị trí, diện tích, pháp lý, công năng, tiện ích, giá bán, ưu điểm, số điện thoại.</div>
          </div>

          <div className="row">
            <div className="field">
              <label>Giọng đọc</label>
              <select value={voice} onChange={(event) => setVoice(event.target.value as VoiceOption)}>
                {voices.map((item) => (
                  <option value={item} key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Kiểu ghép ảnh</label>
              <select value={mergeStyle} onChange={(event) => setMergeStyle(event.target.value as MergeStyle)}>
                {mergeStyles.map((item) => (
                  <option value={item} key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Độ dài video</label>
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                {durations.map((item) => (
                  <option value={item} key={item}>{item} giây · {item / 8} cảnh</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Model video</label>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="veo-3.1-lite">veo-3.1-lite</option>
                <option value="veo-3.1-fast">veo-3.1-fast</option>
                <option value="veo-3.1-quality">veo-3.1-quality</option>
              </select>
            </div>
          </div>

          <button className="btn" type="button" onClick={handleCreateScenes} disabled={busy}>
            {busy ? 'Đang xử lý...' : 'Tạo phân cảnh'}
          </button>

          <div className="helper">Mỗi cảnh đúng 8 giây. Lời thoại nên khoảng 20–26 từ để tự nhiên.</div>
        </form>

        <aside className="card status">
          <h2>2. Trạng thái</h2>
          <div className="status-box">
            <div className="status-title">
              <strong>Tiến trình</strong>
              <span className={`pill ${status.includes('xong') || status.includes('Đã') ? 'ok' : status === 'Lỗi' ? 'err' : ''}`}>{status}</span>
            </div>
            <div className="small">Dự kiến: {expectedScenes} cảnh · {duration} giây · {voice} · {mergeStyle}</div>
          </div>

          {error && <div className="status-box error">{error}</div>}

          {finalVideoUrl && (
            <div className="status-box">
              <h3>Video hoàn chỉnh</h3>
              <video src={finalVideoUrl} controls playsInline />
              <div style={{ height: 12 }} />
              <a className="download" href={finalVideoUrl} download="video-bat-dong-san-ai.mp4">Tải video hoàn chỉnh</a>
            </div>
          )}

          <div className="status-box">
            <strong>Quy trình</strong>
            <ol className="steps">
              <li>Tạo phân cảnh theo độ dài đã chọn.</li>
              <li>Tạo ảnh ghép nhân vật với từng ảnh bất động sản.</li>
              <li>Cho phép sửa lời thoại, tạo lại ảnh hoặc lời thoại từng cảnh.</li>
              <li>Tạo video từng cảnh 8 giây theo đúng thứ tự.</li>
              <li>Ghép các video cảnh thành video hoàn chỉnh 9:16.</li>
            </ol>
          </div>

          {raw ? (
            <details className="status-box">
              <summary>Debug response</summary>
              <pre className="small">{JSON.stringify(raw, null, 2)}</pre>
            </details>
          ) : null}
        </aside>
      </section>

      {scenes.length > 0 && (
        <section className="card scenes-card">
          <div className="section-head">
            <div>
              <h2>3. Phân cảnh</h2>
              <p className="helper">Có thể sửa lời thoại từng cảnh. Nếu quá dài, app sẽ cảnh báo và không cho tạo video.</p>
            </div>
            <button className="btn compact" type="button" onClick={handleCreateAllVideos} disabled={busy || !allImagesReady || hasLongNarration}>
              Tạo tất cả video
            </button>
          </div>

          <div className="scene-list">
            {scenes.map((scene) => {
              const tooLong = isNarrationTooLong(scene.narration);
              return (
                <article className="scene-card" key={scene.id}>
                  <div className="scene-media">
                    {scene.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={scene.imageUrl} alt={`Ảnh ghép cảnh ${scene.index}`} />
                    ) : (
                      <div className="placeholder">Chưa có ảnh ghép</div>
                    )}

                    {scene.videoUrl && <video src={scene.videoUrl} controls playsInline />}
                  </div>

                  <div className="scene-content">
                    <div className="status-title">
                      <h3>Cảnh {scene.index}: {scene.title}</h3>
                      <span className={`pill ${scene.error ? 'err' : scene.videoUrl ? 'ok' : ''}`}>{scene.status || 'Sẵn sàng'}</span>
                    </div>

                    <div className="small">Ảnh BĐS dùng: {scene.propertyImageName || `Ảnh ${scene.propertyImageIndex + 1}`}</div>

                    <label>Lời thoại 8 giây</label>
                    <textarea value={scene.narration} onChange={(event) => setScenePatch(scene.id, { narration: event.target.value })} />
                    <div className={`helper ${tooLong ? 'danger-text' : ''}`}>
                      {tooLong ? 'Lời thoại đang vượt quá 8 giây, vui lòng rút ngắn nội dung.' : `${countVietnameseWords(scene.narration)} từ · phù hợp 8 giây`}
                    </div>

                    <label>Ghi chú hành động/góc máy</label>
                    <textarea value={scene.actionNote} onChange={(event) => setScenePatch(scene.id, { actionNote: event.target.value })} />

                    <details>
                      <summary>Prompt ghép ảnh</summary>
                      <pre className="small">{scene.imagePrompt}</pre>
                    </details>

                    {scene.error && <div className="status-box error">{scene.error}</div>}

                    <div className="button-row">
                      <button className="btn secondary" type="button" disabled={busy} onClick={() => handleRegenerateImage(scene)}>Tạo lại ảnh</button>
                      <button className="btn secondary" type="button" disabled={busy} onClick={() => handleRegenerateNarration(scene)}>Tạo lại lời thoại</button>
                      <button className="btn secondary" type="button" disabled={busy || !scene.imageMediaGenerationId || tooLong} onClick={() => createVideoForScene(scene)}>Tạo lại video cảnh này</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
