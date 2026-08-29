// 爬蟲設定檔

export const CONFIG = {
    // 基礎網址
    BASE_URL: 'https://www.gamer.com.tw/',
    FORUM_BASE_URL: 'https://forum.gamer.com.tw/',

    // 爬取文章數量限制
    FETCH_LIMIT: 30,

    // 逾時設定 (毫秒)
    TIMEOUT: {
        PAGE_LOAD: 60000,
        SELECTOR: 20000,
        BOARD_LOAD: 30000,
    },

    // 要追蹤的看板列表 (可以在這裡寫註解備註看板名稱)
    WATCH_BOARDS: [
        '37505', // 世界計畫
        '81566', // 星塔旅人（GitHub Actions IP 會被 Cloudflare 擋，失敗就算了）
        '33651', // 明日方舟
        '26380', // 魔靈召喚
        '29330', // 闇影詩章
        '74604', // 明日方舟：終末地
    ],

    BAN_KEYWORD: ['集中', '曬卡', '梗圖', '公會', '非洲', '歐洲'],
};

