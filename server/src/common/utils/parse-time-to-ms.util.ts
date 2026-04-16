const timeMap = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export const parseTimeToMs = (timeStr: string): number => {
  const numeric = parseInt(timeStr, 10);
  const unit = timeStr.slice(-1) as keyof typeof timeMap;

  return numeric * (timeMap[unit] || 1);
};
