/// <reference lib="webworker" />
// ↑↑↑ 1. 這一行非常重要！必須放在檔案最上面，解決 ServiceWorkerGlobalScope 找不到的問題

import { defaultCache } from '@serwist/next/worker';
import { type PrecacheEntry, Serwist } from 'serwist';

declare const self: ServiceWorkerGlobalScope & {
    // 注入編譯後的 manifest 清單
    __SW_MANIFEST: (PrecacheEntry | string)[];
};

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
