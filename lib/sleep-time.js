// lib/sleep-time.js
// Pure time/date helpers for the sleep tracker. Keep this file import-free so
// `node` can load it directly for one-off checks (project has no test runner).
// All "now"/"today" values are Asia/Taipei; life_sleep time columns hold Taipei wall-clock time.

export const getTaipeiTime = () =>
    new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Taipei',
        hour12: false,
    });

export const getTaipeiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

// Local-midnight Date is only used to read the weekday; no timezone shift involved.
export const getWeekdayFromDate = (dateStr) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { weekday: 'short' });

// Wake earlier than sleep means the session crossed midnight; sessions are assumed < 24h.
// Seconds are ignored.
export const calculateDurationMinutes = (startTime, endTime) => {
    const parseMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const start = parseMinutes(startTime);
    let end = parseMinutes(endTime);
    if (end < start) end += 24 * 60;

    return end - start;
};

// YYYY-MM-DD strings for the last n days ending at today (Taipei), oldest first
export const lastNDates = (n) => {
    const base = new Date(`${getTaipeiToday()}T00:00:00Z`);
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
};

export const toHHMM = (time) => (time ? time.slice(0, 5) : '');

export const formatDuration = (minutes) => `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;

export const formatTaipeiMonthDay = (timestamp) =>
    new Date(timestamp).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });

const withSeconds = (time) => (time.length === 5 ? `${time}:00` : time);

// sleep / wake accept 'HH:MM' (form input) or 'HH:MM:SS' (DB / getTaipeiTime).
export const buildCompleteFields = ({ date, sleep, wake, dayType }) => {
    const sleepTime = withSeconds(sleep);
    const wakeTime = withSeconds(wake);
    return {
        date,
        weekday: getWeekdayFromDate(date),
        sleep_time: sleepTime,
        wake_time: wakeTime,
        day_type: dayType,
        total: calculateDurationMinutes(sleepTime, wakeTime),
    };
};
