import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.mjs';

// 掛載隱形插件 (這是繞過 Cloudflare 的關鍵)
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeHeadlines(page) {
    console.log('正在爬取頭條...');
    try {
        await page.goto(CONFIG.BASE_URL, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT.PAGE_LOAD });
        await page.waitForSelector('.headline-news__wrapper', { timeout: CONFIG.TIMEOUT.SELECTOR });

        return await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.headline-news__wrapper .swiper-slide').forEach((node) => {
                const title = node.querySelector('.headline-news__title')?.innerText?.trim();
                const link = node.querySelector('a.headline-news__content')?.href;
                if (title && link) items.push({ title, url: link });
            });
            return items;
        });
    } catch (error) {
        console.error('Headlines Error:', error.message);
        return [];
    }
}

async function scrapeBoard(page, boardId) {
    console.log(`正在爬取看板 ${boardId}...`);
    const targetUrl = `${CONFIG.FORUM_BASE_URL}B.php?bsn=${boardId}`;

    try {
        // 使用 networkidle2 讓 Cloudflare 有時間跑完驗證腳本
        const response = await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.TIMEOUT.BOARD_LOAD,
        });

        // 檢查是否遇到 403 (Cloudflare Block)
        if (response && response.status() === 403) {
            console.warn(`⚠️ 看板 ${boardId} 遭遇 403 Forbidden，嘗試等待 Cloudflare 驗證...`);
            // 給它一點時間讓 Stealth Plugin 發揮作用自動跳轉
            await new Promise((r) => setTimeout(r, 5000));
        }

        // --- 18+ 驗證繞過 ---
        try {
            const adultBtn = await page.$('#adult');
            if (adultBtn) {
                console.log(`⚠️ 看板 ${boardId} 觸發 18+ 驗證，正在繞過...`);
                await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }), adultBtn.click()]);
            }
        } catch (e) {
            // 忽略找不到按鈕的錯誤
        }
        // ------------------

        await page.waitForSelector('.b-list__row', { timeout: CONFIG.TIMEOUT.SELECTOR });

        const data = await page.evaluate(
            (limit, boardId, banKeywords) => {
                const nameEl = document.querySelector('a[data-gtm="選單-看板名稱"]');
                const boardName = nameEl ? nameEl.innerText.trim() : '看板 ' + boardId;

                const rows = document.querySelectorAll('tr.b-list__row');
                const posts = [];
                const excludeKeywords = banKeywords;
                const validTimeKeywords = ['剛剛', '分前', '小時前', '昨天', '前天'];

                for (const row of rows) {
                    if (posts.length >= limit) break;
                    if (row.classList.contains('b-list__row--sticky')) continue;

                    const titleEl = row.querySelector('.b-list__main__title');
                    const timeEl = row.querySelector('.b-list__time__edittime a');
                    const briefEl = row.querySelector('.b-list__brief');

                    if (!titleEl || !timeEl) continue;

                    const title = titleEl.innerText.trim();
                    const time = timeEl.innerText.trim();

                    if (excludeKeywords.some((k) => title.includes(k))) continue;
                    if (!validTimeKeywords.some((k) => time.includes(k))) continue;

                    posts.push({
                        title,
                        url: titleEl.getAttribute('href') || '',
                        time,
                        brief: briefEl ? briefEl.innerText.trim() : '',
                    });
                }
                return { name: boardName, posts };
            },
            CONFIG.FETCH_LIMIT,
            boardId,
            CONFIG.BAN_KEYWORD,
        );

        return data;
    } catch (e) {
        // =========== [關鍵 Debug 區域] ===========
        console.error(`❌ Error scraping board ${boardId}: ${e.message}`);

        try {
            // 1. 印出最後停留的網址 (確認是否被轉址)
            const currentUrl = page.url();
            console.error(`   👉 Current URL: ${currentUrl}`);

            // 2. 印出網頁標題 (確認是否為 18+ 警告頁或 Cloudflare)
            const title = await page.title();
            console.error(`   👉 Page Title: "${title}"`);

            // 3. 印出頁面內容的前 500 個字 (看 HTML 結構)
            // 這能讓你看到頁面上到底顯示了什麼文字 (例如 "未滿18歲" 或 "Access denied")
            const content = await page.content();
            const cleanContent = content.replace(/\s+/g, ' ').substring(0, 500); // 壓縮空白並取前500字
            console.error(`   👉 HTML Snapshot (Top 500 chars): ${cleanContent}`);

            // 4. 特別檢查是否還停留在 18+ 頁面
            const hasAdultBtn = await page.$('#adult');
            if (hasAdultBtn) {
                console.error(`   👉 [診斷] 頁面上仍存在 18+ 按鈕，代表點擊失敗或頁面重整了。`);
            }
        } catch (debugError) {
            console.error(`   (Debug info failed: ${debugError.message})`);
        }
        // =======================================
        // 如果失敗，回傳空資料避免中斷整個流程
        return { name: `看板 ${boardId} (Error)`, posts: [] };
    }
}

// 主程式
(async () => {
    console.log('🚀 啟動 GitHub Worker 爬蟲 (Stealth Mode Enabled)...');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            Referer: 'https://www.gamer.com.tw/', // 告訴它我們是從首頁連過去的，不是憑空出現
        });

        const headlines = await scrapeHeadlines(page);
        const boards = [];
        for (const boardId of CONFIG.WATCH_BOARDS) {
            const boardData = await scrapeBoard(page, boardId);
            boards.push(boardData);
            // 隨機延遲 3~6 秒，模仿人類閱讀節奏 (Cloudflare 喜歡這種行為)
            const delay = Math.floor(Math.random() * 3000) + 3000;
            await new Promise((r) => setTimeout(r, delay));
        }

        const output = {
            headlines,
            boards,
            generatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        };

        const outputPath = path.join(__dirname, '../public/daily-news.json');
        const publicDir = path.dirname(outputPath);
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`✅ 資料已寫入: ${outputPath}`);
    } catch (error) {
        console.error('❌ 腳本執行失敗:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
