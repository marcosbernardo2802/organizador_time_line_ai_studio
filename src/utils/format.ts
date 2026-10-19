export const fmt = (s: number): string => {
  const m  = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
};

export const normalizeMediaName = (name: string): string => {
  return String(name || '')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
