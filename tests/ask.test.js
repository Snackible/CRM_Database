// How the Ask box reads questions and dates. Pure functions; no database.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePeriod } from "../lib/periods.js";
import { planQuestion } from "../lib/ask.js";

const today = new Date(2026, 9, 26); // 26 Oct 2026

test("periods read the way people say them", () => {
  assert.deepEqual(pick(parsePeriod("revenue this month", today)), ["2026-10-01", "2026-10-26"]);
  assert.deepEqual(pick(parsePeriod("top clients last month", today)), ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(pick(parsePeriod("sales this year", today)), ["2026-01-01", "2026-10-26"]);
  assert.deepEqual(pick(parsePeriod("last 30 days", today)), ["2026-09-27", "2026-10-26"]);
  assert.deepEqual(pick(parsePeriod("new clients in march", today)), ["2026-03-01", "2026-03-31"]);
  assert.deepEqual(pick(parsePeriod("orders in november", today)), ["2025-11-01", "2025-11-30"], "a month later in the year means last year's");
  assert.deepEqual(pick(parsePeriod("feb 2026", today)), ["2026-02-01", "2026-02-28"]);
  assert.equal(parsePeriod("who may order again", today), null, "the word may is not the month May");
  assert.equal(parsePeriod("top clients", today), null);
});

test("questions map to the right kind of answer", () => {
  const p = (q) => planQuestion(q, today, ["Aditi", "Prabhnoor"]);
  assert.equal(p("Top 5 clients last month").intent, "top");
  assert.equal(p("Top 5 clients last month").limit, 5);
  assert.equal(p("who has gone quiet?").intent, "quiet");
  assert.equal(p("clients that haven't ordered in 60 days").intent, "notOrdered");
  assert.equal(p("clients that haven't ordered in 2 months").days, 60);
  assert.equal(p("revenue this month").intent, "totals");
  assert.equal(p("revenue by month").intent, "byMonth");
  assert.equal(p("revenue by channel this year").intent, "channel");
  assert.equal(p("new clients in September").intent, "newClients");
  assert.equal(p("leads for Prabhnoor").intent, "leads");
  assert.equal(p("leads for Prabhnoor").owner, "Prabhnoor");
  assert.equal(p("Aditi's clients").intent, "owner");
  const c = p("Greenleaf Mart payment terms");
  assert.equal(c.intent, "client");
  assert.equal(c.term, "greenleaf mart");
  assert.equal(c.focus, "Commercial");
  assert.equal(p("orders from greenleaf").intent, "client");
});

test("notes are only drafted, with the client and the text pulled apart", () => {
  assert.deepEqual(planQuestion("note for Greenleaf Mart: wants samples before Diwali", today), { intent: "note", term: "Greenleaf Mart", text: "wants samples before Diwali" });
  assert.deepEqual(planQuestion("Add a note to Brew & Bite - call back Monday", today), { intent: "note", term: "Brew & Bite", text: "call back Monday" });
  assert.equal(planQuestion("notes about greenleaf", today).intent, "client", "asking about notes is not writing one");
});

function pick(r) {
  return r ? [r.from, r.to] : null;
}
