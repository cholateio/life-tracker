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
        SELECTOR: 30000,
        BOARD_LOAD: 60000,
    },

    // 要追蹤的看板列表 (可以在這裡寫註解備註看板名稱)
    WATCH_BOARDS: [
        '80099', // 卡厄思夢境
        '29330', // SV2
        '33651', // 明日方舟
        '74604', // 明日方舟終末地
        '81566', // 星塔旅人
        '37505', // 世界計畫
        '36476', // 雀魂
        '37697', // 緋染天空
        '76207', // 棕色塵埃2
    ],

    BAN_KEYWORD: ['集中', '曬卡', '梗圖', '公會', '非洲', '歐洲'],
};
