export const THEMES = [
    {
        id: 'dev',
        name: '開發之夜',
        defaultWeight: 25,
        color: '#2d3748',
        entry: '打開 IDE，寫至少一個功能',
        mainRule: '整晚螢幕主要時間都在 IDE。',
    },
    {
        id: 'study',
        name: '學習之夜',
        defaultWeight: 20,
        color: '#2c7a7b',
        entry: '選一個來源，計時器設 50 分鐘，開始',
        mainRule: '整晚圍繞學習主題，可以切換不同領域。',
    },
    {
        id: 'play',
        name: '娛樂之夜',
        defaultWeight: 20,
        color: '#dd6b20',
        entry: '打開 PS5 或開始播放動畫第一集',
        mainRule: '遊戲 / 動畫 / 實況都行，限在娛樂範圍。',
    },
    {
        id: 'solo',
        name: '獨處之夜',
        defaultWeight: 20,
        color: '#6b46c1',
        entry: '打開 AI 對話框輸入第一句',
        mainRule: '跟自己對話的時段。可以：AI 深聊 / 寫東西 / 手作 / 放音樂發呆。不開遊戲、不滑社群、手機放遠。',
    },
    {
        id: 'free',
        name: '自由之夜',
        defaultWeight: 15,
        color: '#94a3b8',
        entry: null,
        mainRule: '滑手機、看 YouTube、發呆、加班、睡覺都行——這是掙來的自由。',
    },
];

export const THEMES_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
