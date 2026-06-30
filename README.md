# Flow Video MVP

App MVP tạo video 8 giây từ ảnh nhân vật bằng UseAPI Google Flow.

## Tính năng

- Upload 1 ảnh nhân vật PNG/JPG/WEBP.
- Nhập nội dung/lời thoại.
- Gọi UseAPI `POST /assets` để upload ảnh.
- Lấy `mediaGenerationId` rồi gọi `POST /videos` với `startImage`.
- Nhận `jobid` và tự poll `GET /jobs/{jobid}` mỗi 5 giây.
- Khi job hoàn tất, hiển thị video và nút mở/tải video.

## Biến môi trường

Tạo file `.env.local` khi chạy local:

```bash
USEAPI_TOKEN=user:YOUR_USEAPI_TOKEN_HERE
USEAPI_EMAIL=your-flow-gmail@gmail.com
```

Trên Vercel, vào Project → Settings → Environment Variables, thêm 2 biến này.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Deploy Vercel

1. Tạo GitHub repo mới.
2. Upload toàn bộ source này lên repo.
3. Vào https://vercel.com → Add New Project.
4. Import repo.
5. Thêm Environment Variables:
   - `USEAPI_TOKEN`
   - `USEAPI_EMAIL`
6. Bấm Deploy.

## Lưu ý bảo mật

Không đưa `USEAPI_TOKEN` vào frontend. App này chỉ dùng token trong API route server-side.
