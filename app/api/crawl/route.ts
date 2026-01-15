import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer, { Page, Browser } from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// --- 型別定義 ---
interface Post {
    title: string;
    url: string;
    time: string;
    brief: string;
    isRead?: boolean;
}

interface BoardData {
    name: string;
    posts: Post[];
}

interface ChromiumLibrary {
    args: string[];
    defaultViewport: {
        width: number;
        height: number;
        deviceScaleFactor?: number;
        isMobile?: boolean;
        hasTouch?: boolean;
        isLandscape?: boolean;
    };
    executablePath: (path?: string) => Promise<string>;
    headless: boolean | 'shell';
}

// --- 環境變數與常數設定 ---
const isLocal = process.env.NODE_ENV === 'development';
const BASE_URL = process.env.BASE_URL || 'https://www.gamer.com.tw/';
const FORUM_BASE_URL = process.env.FORUM_BASE_URL || 'https://forum.gamer.com.tw/';
const WATCH_BOARDS = (process.env.BOARDS || '60076, 36730')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const FETCH_LIMIT = 20;

// [檔案路徑設定]
const HISTORY_FILE = path.join(process.cwd(), 'read-history.json');
const DELETE_FILE = path.join(process.cwd(), 'delete-history.json'); // [新增] 刪除記錄檔
const EXPIRE_DAYS = 7;
const DELETE_EXPIRE_DAYS = 30; // [新增] 刪除的記錄保留 30 天，避免短期內重複看到

// --- 歷史記錄管理函式 (通用版) ---

// 讀取 JSON 檔案
function loadJson(filePath: string): Record<string, number> {
    if (!fs.existsSync(filePath)) return {};
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

// 寫入 JSON 檔案並清理過期
function updateJsonFile(filePath: string, url: string, daysToExpire: number) {
    const history = loadJson(filePath);
    const now = Date.now();

    // 更新
    history[url] = now;

    // 清理
    const expireTime = daysToExpire * 24 * 60 * 60 * 1000;
    const cleanHistory: Record<string, number> = {};
    for (const [k, v] of Object.entries(history)) {
        if (now - v < expireTime) {
            cleanHistory[k] = v;
        }
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(cleanHistory, null, 2), 'utf-8');
    } catch (error) {
        console.error(`Failed to write to ${filePath}:`, error);
    }
}

// --- 核心爬蟲函式 (保持不變) ---

async function launchBrowser(): Promise<Browser> {
    if (isLocal) {
        const executablePath =
            process.platform === 'win32'
                ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

        return puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath,
            headless: true,
            channel: 'chrome',
        });
    } else {
        const chromiumPack = chromium as unknown as ChromiumLibrary;
        return puppeteer.launch({
            args: chromiumPack.args,
            defaultViewport: chromiumPack.defaultViewport,
            executablePath: await chromiumPack.executablePath(),
            headless: chromiumPack.headless,
        });
    }
}

async function scrapeHeadlines(page: Page) {
    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.headline-news__wrapper', { timeout: 5000 }).catch(() => null);

        return await page.evaluate(() => {
            const items: { title: string; url: string }[] = [];
            document.querySelectorAll('.headline-news__wrapper .swiper-slide').forEach((node) => {
                const title = (node.querySelector('.headline-news__title') as HTMLElement)?.innerText?.trim();
                const link = (node.querySelector('a.headline-news__content') as HTMLAnchorElement)?.href;
                if (title && link) items.push({ title, url: link });
            });
            return items;
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Headlines Error:', msg);
        return [];
    }
}

async function scrapeBoard(page: Page, boardId: string): Promise<BoardData> {
    const targetUrl = `${FORUM_BASE_URL}B.php?bsn=${boardId}`;

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.b-list__row', { timeout: 5000 }).catch(() => null);

        const data = await page.evaluate((limit) => {
            const nameEl = document.querySelector('a[data-gtm="選單-看板名稱"]') as HTMLElement;
            const boardName = nameEl ? nameEl.innerText.trim() : `看板 ${boardId}`;

            const rows = document.querySelectorAll('tr.b-list__row');
            const posts: Post[] = [];
            const excludeKeywords = ['集中', '新手', '梗圖', '公告'];
            const validTimeKeywords = ['剛剛', '分前', '小時前', '昨天'];

            for (const row of rows) {
                if (posts.length >= limit) break;
                if (row.classList.contains('b-list__row--sticky')) continue;

                const titleEl = row.querySelector('.b-list__main__title') as HTMLElement;
                const timeEl = row.querySelector('.b-list__time__edittime a') as HTMLElement;
                const briefEl = row.querySelector('.b-list__brief') as HTMLElement;

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
        }, FETCH_LIMIT);

        if (data.name === `看板 undefined`) data.name = `看板 ${boardId}`;
        return data;
    } catch (e) {
        console.error(`Error scraping board ${boardId}:`, e);
        return { name: `看板 ID ${boardId} (Error)`, posts: [] };
    }
}

// --- Main Handlers ---

export async function GET() {
    console.log(`🚀 啟動爬蟲 (${isLocal ? 'Local' : 'Serverless'})...`);
    let browser: Browser | null = null;

    try {
        browser = await launchBrowser();
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        );

        const headlines = await scrapeHeadlines(page);

        const boards: BoardData[] = [];
        for (const boardId of WATCH_BOARDS) {
            const boardData = await scrapeBoard(page, boardId);
            boards.push(boardData);
        }

        // [修改 1] 讀取所有記錄
        const readHistory = loadJson(HISTORY_FILE);
        const deleteHistory = loadJson(DELETE_FILE); // [新增]

        // [修改 2] 過濾與標記
        const filteredBoards = boards.map((board) => {
            return {
                ...board,
                posts: board.posts
                    // 先過濾掉已刪除的文章
                    .filter((post) => !deleteHistory[post.url])
                    // 再標記已讀狀態
                    .map((post) => ({
                        ...post,
                        isRead: !!readHistory[post.url],
                    })),
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                headlines,
                boards: filteredBoards,
                generatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            },
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Crawler failed';
        console.error('Crawler Critical Error:', error);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    } finally {
        if (browser) await browser.close();
    }
}

// [修改] POST 處理多種動作
export async function POST(req: Request) {
    try {
        const body = await req.json();
        // 支援 { url, action: 'read' | 'delete' }，預設為 read 以相容舊碼
        const { url, action = 'read' } = body;

        if (!url) {
            return NextResponse.json({ success: false, error: 'URL required' }, { status: 400 });
        }

        if (action === 'delete') {
            updateJsonFile(DELETE_FILE, url, DELETE_EXPIRE_DAYS);
        } else {
            updateJsonFile(HISTORY_FILE, url, EXPIRE_DAYS);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Update history failed:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
