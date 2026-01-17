import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.mjs';

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
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT.BOARD_LOAD });

        // --- 自動過濾 18+ 驗證頁面 ---
        try {
            // 檢查頁面上是否有 ID 為 'adult' 的按鈕 (巴哈姆特標準的 18+ 同意按鈕)
            const adultBtn = await page.$('#adult');
            if (adultBtn) {
                console.log(`⚠️ 看板 ${boardId} 觸發 18+ 驗證，正在繞過...`);
                await Promise.all([
                    // 點擊後等待頁面跳轉完成
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
                    adultBtn.click(),
                ]);
            }
        } catch (e) {
            console.log(`看板 ${boardId} 18+ 驗證處理時發生微小錯誤 (通常可忽略): ${e.message}`);
        }
        // -----------------------------------

        // 現在再等待列表出現
        await page.waitForSelector('.b-list__row', { timeout: CONFIG.TIMEOUT.SELECTOR });

        const data = await page.evaluate(
            (limit, boardId, banKeywords) => {
                const nameEl = document.querySelector('a[data-gtm="選單-看板名稱"]');
                const boardName = nameEl ? nameEl.innerText.trim() : '看板 ' + boardId;

                const rows = document.querySelectorAll('tr.b-list__row');
                const posts = [];
                const excludeKeywords = banKeywords;
                const validTimeKeywords = ['剛剛', '分前', '小時前', '昨天'];

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
        console.error(`Error scraping board ${boardId}:`, e.message);
        return { name: `看板 ${boardId} (Error)`, posts: [] };
    }
}

// 主程式
(async () => {
    console.log('🚀 啟動 GitHub Worker 爬蟲...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();

        await page.setUserAgent({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const headlines = await scrapeHeadlines(page);
        const boards = [];
        for (const boardId of CONFIG.WATCH_BOARDS) {
            const boardData = await scrapeBoard(page, boardId);
            boards.push(boardData);
            await new Promise((r) => setTimeout(r, 2000)); // 禮貌性延遲
        }

        const output = {
            headlines,
            boards,
            generatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        };

        const outputPath = path.join(__dirname, '../public/daily-news.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`✅ 資料已寫入: ${outputPath}`);
    } catch (error) {
        console.error('❌ 腳本執行失敗:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
