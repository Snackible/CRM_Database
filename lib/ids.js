import { bad } from "./errors.js";

export function idOf(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw bad("That link is not valid.");
  return n;
}
