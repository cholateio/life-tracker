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

// The wake date a session belongs to: started at/after noon -> wakes the next day, before noon -> same day.
// createdAt is the session start (startSession/restartSession set it together with sleep_time).
export const expectedWakeDate = (createdAt, sleepTime) => {
    const startDate = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    if (Number(sleepTime.slice(0, 2)) < 12) return startDate;
    const next = new Date(`${startDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
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

const addDays = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// Onset is measured from 18:00 so a 23:30 -> 02:00 spread averages correctly across midnight.
const ONSET_ORIGIN = 18 * 60;
const toOnsetOffset = (time) => (toMinutes(time) + 24 * 60 - ONSET_ORIGIN) % (24 * 60);
export const onsetOffsetToClock = (offset) => formatClock((Math.round(offset) + ONSET_ORIGIN) % (24 * 60));
export const formatClock = (minutes) => {
    const m = Math.round(minutes);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const SHORT_NIGHT_MINUTES = 5 * 60;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const summarizeWindow = (rows) => {
    const workday = rows.filter((r) => r.day_type === 'WORKDAY');
    const holiday = rows.filter((r) => r.day_type === 'HOLIDAY');
    const shortCount = rows.filter((r) => r.total < SHORT_NIGHT_MINUTES).length;
    return {
        nights: rows.length,
        onsetOffset: avg(rows.map((r) => toOnsetOffset(r.sleep_time))),
        workdayHours: avg(workday.map((r) => r.total / 60)),
        shortCount,
        shortPerWeek: rows.length ? (shortCount / rows.length) * 7 : null,
        holidayWake: avg(holiday.map((r) => toMinutes(r.wake_time))),
    };
};

// Recent = the 7 days ending today; base = the 28 days before that. Only complete rows count.
// Short-night rates are per recorded night, so missing days do not read as improvement.
export const summarizeSleep = (rows, today) => {
    const recentStart = addDays(today, -6);
    const baseStart = addDays(today, -34);
    const complete = rows.filter((r) => r.wake_time && r.sleep_time && r.total != null && r.date);
    return {
        recent: summarizeWindow(complete.filter((r) => r.date >= recentStart && r.date <= today)),
        base: summarizeWindow(complete.filter((r) => r.date >= baseStart && r.date < recentStart)),
    };
};
