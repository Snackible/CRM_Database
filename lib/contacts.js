// Same cleaning rules as the B2B Delivery Tracker's users sheet.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanEmail(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return EMAIL.test(v) && v.length <= 120 ? v : null;
}

/** Digits with country code. A bare 10-digit number is taken as an Indian mobile (adds 91). */
export function cleanPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
