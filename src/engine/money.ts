export function fmtMoney(minor: number, currency = "GBP"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return currency === "GBP" ? `${sign}£${body}` : `${sign}${currency} ${body}`;
}
