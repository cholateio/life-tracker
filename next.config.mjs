import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
    // Service Worker 的來源檔案
    swSrc: 'app/sw.js',
    // 編譯後的輸出位置 (必須在 public 下)
    swDest: 'public/sw.js',
    // 開發環境下通常建議關閉 SW，避免快取導致除錯困難
    disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
    serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
};

export default withSerwist(nextConfig);
