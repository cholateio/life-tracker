// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

// 初始化 GCP Storage 客戶端
// 使用環境變數帶入憑證，並處理 Private Key 中常見的換行字元跳脫問題
const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

const bucketName = process.env.GCP_BUCKET_NAME || 'cholate-thumbnail';
const bucket = storage.bucket(bucketName);

export async function POST(req) {
    try {
        // 1. 解析前端傳來的 FormData
        const formData = await req.formData();
        const file = formData.get('file');
        const folder = formData.get('folder') || 'general'; // 可傳入 'anime' 或 'milestone' 來分類資料夾

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // 2. 將 File 物件轉為 Buffer，以便在記憶體中處理
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 3. 計算 SHA-256 雜湊值作為唯一檔名
        const hashSum = crypto.createHash('sha256');
        hashSum.update(buffer);
        const fileHash = hashSum.digest('hex');

        // 取得副檔名 (前端將強制轉為 .jpg，這邊動態抓取以防萬一)
        const originalName = file.name;
        const extension = originalName.substring(originalName.lastIndexOf('.')) || '.jpg';
        const destinationPath = `${folder}/${fileHash}${extension}`;

        // 4. 將 Buffer 直接上傳至 GCP (Serverless 最佳實踐)
        const gcsFile = bucket.file(destinationPath);
        await gcsFile.save(buffer, {
            metadata: {
                contentType: file.type || 'image/jpeg',
                cacheControl: 'public, max-age=31536000',
            },
        });

        // 5. 組合並回傳公開的 URL
        const gcsUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;

        return NextResponse.json({ url: gcsUrl }, { status: 200 });
    } catch (error) {
        console.error('Upload Error:', error);
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
}
