export function startOfCurrentMonthManila(now = new Date()): Date {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  return new Date(`${formatted}-01T00:00:00+08:00`);
}
