import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { supabase } from '@/lib/supabase';

// --- 環境變數與常數設定 ---
const isLocal = process.env.NODE_ENV === 'development';
const BASE_URL = 'https://www.gamer.com.tw/';
const FORUM_BASE_URL = 'https://forum.gamer.com.tw/';
const WATCH_BOARDS = ['80099', '81566', '37505', '33651', '29330', '37697', '74604'];
const FETCH_LIMIT = 15;
const EXPIRE_DAYS = 3;

// --- 核心爬蟲函式 ---
async function launchBrowser() {
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
        return puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }
}

async function scrapeHeadlines(page) {
    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.headline-news__wrapper', { timeout: 5000 }).catch(() => null);

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
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Headlines Error:', msg);
        return [];
    }
}

async function scrapeBoard(page, boardId) {
    console.log(boardId);
    const targetUrl = `${FORUM_BASE_URL}B.php?bsn=${boardId}`;

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.b-list__row', { timeout: 5000 }).catch(() => null);

        const data = await page.evaluate(
            (limit, boardId) => {
                const nameEl = document.querySelector('a[data-gtm="選單-看板名稱"]');
                const boardName = nameEl ? nameEl.innerText.trim() : `看板 ${boardId}`;

                const rows = document.querySelectorAll('tr.b-list__row');
                const posts = [];
                const excludeKeywords = ['集中', '新手', '梗圖', '公告'];
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
            FETCH_LIMIT,
            boardId
        );

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
    let browser = null;

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

        const boards = [];
        for (const boardId of WATCH_BOARDS) {
            const boardData = await scrapeBoard(page, boardId);
            boards.push(boardData);
        }

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - EXPIRE_DAYS);

        const { data: historyData, error } = await supabase
            .from('Bahamut')
            .select('url, status, created_at')
            .gte('created_at', threeDaysAgo.toISOString());

        if (error) console.error('Supabase fetch error:', error);

        const readHistory = new Set();
        const deleteHistory = new Set();
        const now = Date.now();

        if (historyData) {
            historyData.forEach((row) => {
                const rowTime = new Date(row.created_at).getTime();
                const daysDiff = (now - rowTime) / (1000 * 60 * 60 * 24);

                if (row.status === 'deleted') {
                    if (daysDiff <= EXPIRE_DAYS) deleteHistory.add(row.url);
                } else if (row.status === 'read') {
                    if (daysDiff <= EXPIRE_DAYS) readHistory.add(row.url);
                }
            });
        }

        const filteredBoards = boards.map((board) => {
            return {
                ...board,
                posts: board.posts
                    .filter((post) => !deleteHistory.has(post.url))
                    .map((post) => ({
                        ...post,
                        isRead: readHistory.has(post.url),
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
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Crawler failed';
        console.error('Crawler Critical Error:', error);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    } finally {
        if (browser) await browser.close();
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { url, action = 'read' } = body; // action: 'read' | 'delete'

        if (!url) {
            return NextResponse.json({ success: false, error: 'URL required' }, { status: 400 });
        }

        const status = action === 'delete' ? 'deleted' : 'read';

        const { error } = await supabase.from('Bahamut').upsert(
            {
                url,
                status,
                created_at: new Date().toISOString(),
            },
            { onConflict: 'url' }
        );

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Update history failed:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
