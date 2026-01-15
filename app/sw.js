import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    // 讓新的 Service Worker 安裝後立即接管頁面
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    // 使用 Serwist 提供的 Next.js 最佳化快取策略 (包含字型、圖片、靜態資源)
    runtimeCaching: defaultCache,
});

serwist.addEventListeners();
