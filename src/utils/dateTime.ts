const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const pad = (value: number): string => String(value).padStart(2, '0');

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATETIME_SPACE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

const formatLocalDateTime = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const getDatePartsInTimeZone = (
  value: string | Date,
  timeZone: string
): { year: string; month: string; day: string; hour: string; minute: string } | null => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  if (!year || !month || !day || !hour || !minute) {
    return null;
  }

  return { year, month, day, hour, minute };
};

export const formatInterviewTimeForInput = (value?: string): string => {
  if (!value) return '';

  const trimmed = value.trim();
  if (DATETIME_LOCAL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (DATETIME_SPACE_PATTERN.test(trimmed)) {
    return trimmed.replace(' ', 'T');
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const shanghaiParts = getDatePartsInTimeZone(date, SHANGHAI_TIME_ZONE);
  if (shanghaiParts) {
    return `${shanghaiParts.year}-${shanghaiParts.month}-${shanghaiParts.day}T${shanghaiParts.hour}:${shanghaiParts.minute}`;
  }

  return formatLocalDateTime(date);
};

export const normalizeInterviewTimeForSave = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = DATETIME_SPACE_PATTERN.test(trimmed) ? trimmed.replace(' ', 'T') : trimmed;
  if (DATETIME_LOCAL_PATTERN.test(normalized)) {
    const [datePart, timePart] = normalized.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    if ([year, month, day, hour, minute].every(Number.isFinite)) {
      const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0);
      return new Date(utcMs).toISOString();
    }
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  return date.toISOString();
};

export const getShanghaiDateKey = (value?: string): string => {
  if (!value) return '';
  const parts = getDatePartsInTimeZone(value, SHANGHAI_TIME_ZONE);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

export const formatInterviewTimeInShanghai = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleTimeString('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatInterviewDateInShanghai = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleDateString('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
};
