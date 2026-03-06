// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

// 初始化 GCP Storage 客戶端 (維持在全域即可，因為憑證共用)
const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        const folder = formData.get('folder');

        // 🌟 新增：取得前端指定的 bucket 類型，預設為 thumbnail
        const bucketType = formData.get('bucketType') || 'thumbnail';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // 🌟 新增：動態決定 Bucket 名稱
        let actualBucketName;
        if (bucketType === 'gallery') {
            actualBucketName = process.env.GCP_GALLERY_BUCKET_NAME || 'cholate-gallery';
        } else {
            actualBucketName = process.env.GCP_BUCKET_NAME || 'cholate-thumbnail';
        }

        // 在請求內部動態實例化 bucket
        const bucket = storage.bucket(actualBucketName);

        // ... (中間的 Buffer 與 Hash 轉換邏輯完全相同) ...
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const hashSum = crypto.createHash('sha256');
        hashSum.update(buffer);
        const fileHash = hashSum.digest('hex');

        const originalName = file.name;
        const extension = originalName.substring(originalName.lastIndexOf('.')) || '.jpg';
        const destinationPath = folder ? `${folder}/${fileHash}${extension}` : `${fileHash}${extension}`;

        const gcsFile = bucket.file(destinationPath);
        await gcsFile.save(buffer, {
            metadata: {
                contentType: file.type || 'image/jpeg',
                cacheControl: 'public, max-age=31536000',
            },
        });

        // 🌟 新增：回傳的 URL 也要使用動態的 actualBucketName
        const gcsUrl = `https://storage.googleapis.com/${actualBucketName}/${destinationPath}`;

        return NextResponse.json({ url: gcsUrl }, { status: 200 });
    } catch (error) {
        console.error('Upload Error:', error);
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
}
