/**
 * Today's date (YYYY-MM-DD) in Asia/Kolkata. Safe on server and client.
 * `new Date().toISOString().slice(0, 10)` is the UTC date, which is still
 * "yesterday" in India between 00:00 and 05:30 IST.
 */
export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
