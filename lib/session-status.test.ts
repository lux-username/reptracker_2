import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HouseFloor } from "./floor-schedule";
import {
  houseStatus,
  mondayOf,
  parseSenateRecesses,
  senateStatus,
  type RecessPeriod,
} from "./session-status";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "lib", "__fixtures__", name), "utf-8");
const senateXml = fixture("senate-schedule.xml");

describe("parseSenateRecesses", () => {
  const recesses = parseSenateRecesses(senateXml);

  it("extracts multi-day State Work Period ranges as ISO dates", () => {
    expect(recesses).toContainEqual({ begin: "2026-06-29", end: "2026-07-10" });
    expect(recesses).toContainEqual({ begin: "2026-08-10", end: "2026-09-11" });
  });

  it("excludes single-day federal holidays (empty <action> rows)", () => {
    // New Year's / Presidents' Day are non-legislative but not work periods.
    expect(recesses.some((r) => r.begin === "2026-01-01")).toBe(false);
    expect(recesses.some((r) => r.begin === "2026-02-16")).toBe(false);
  });

  it("keeps a single-day work period (Juneteenth) as begin==end", () => {
    expect(recesses).toContainEqual({ begin: "2026-06-19", end: "2026-06-19" });
  });

  it("returns [] for a document with no work periods, never throws", () => {
    expect(parseSenateRecesses("<schedule><dates></dates></schedule>")).toEqual([]);
    expect(parseSenateRecesses("not xml at all")).toEqual([]);
  });
});

describe("senateStatus", () => {
  const recesses: RecessPeriod[] = [{ begin: "2026-06-29", end: "2026-07-10" }];

  it("reports in session outside every recess range", () => {
    expect(senateStatus(new Date("2026-07-20T12:00:00Z"), recesses, null)).toEqual({
      inSession: true,
      returnDate: null,
    });
  });

  it("reports recess when today is inside a range, preferring the floor convene date", () => {
    const status = senateStatus(
      new Date("2026-07-09T12:00:00Z"),
      recesses,
      "Monday, Jul 13, 2026",
    );
    expect(status).toEqual({ inSession: false, returnDate: "2026-07-13" });
  });

  it("falls back to the business day after the range end when convene is absent", () => {
    // Range ends Fri Jul 10 → next business day is Mon Jul 13.
    const status = senateStatus(new Date("2026-07-09T12:00:00Z"), recesses, null);
    expect(status).toEqual({ inSession: false, returnDate: "2026-07-13" });
  });

  it("ignores a stale (past) convene note and uses the fallback", () => {
    const status = senateStatus(
      new Date("2026-07-09T12:00:00Z"),
      recesses,
      "Monday, Jun 29, 2026",
    );
    expect(status.returnDate).toBe("2026-07-13");
  });

  it("treats the range boundaries as inclusive", () => {
    expect(senateStatus(new Date("2026-06-29T12:00:00Z"), recesses, null).inSession).toBe(false);
    expect(senateStatus(new Date("2026-07-10T12:00:00Z"), recesses, null).inSession).toBe(false);
    expect(senateStatus(new Date("2026-07-11T12:00:00Z"), recesses, null).inSession).toBe(true);
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the containing week (UTC)", () => {
    expect(mondayOf(new Date("2026-07-09T12:00:00Z"))).toBe("2026-07-06"); // Thu → Mon
    expect(mondayOf(new Date("2026-07-06T12:00:00Z"))).toBe("2026-07-06"); // Mon → itself
    expect(mondayOf(new Date("2026-07-12T12:00:00Z"))).toBe("2026-07-06"); // Sun → prior Mon
  });
});

describe("houseStatus", () => {
  const floorFor = (weekOf: string): HouseFloor => ({
    weekOf,
    updatedAt: null,
    congress: 119,
    categories: [{ heading: "", bills: [{ legisNum: "H.R. 1", title: "x", url: null }] }],
  });

  it("in session when a schedule is posted for the current week", () => {
    // now = Thu Jul 9 (week of Jul 6); posted week is Jul 6.
    expect(houseStatus(new Date("2026-07-09T12:00:00Z"), floorFor("2026-07-06"))).toEqual({
      inSession: true,
      returnDate: null,
    });
  });

  it("in session when next week's schedule is posted ahead", () => {
    expect(houseStatus(new Date("2026-07-09T12:00:00Z"), floorFor("2026-07-13")).inSession).toBe(
      true,
    );
  });

  it("out of session when the latest posted week is in the past", () => {
    // Recess: index still links the stale week of Jun 29 while now is Jul 9.
    expect(houseStatus(new Date("2026-07-09T12:00:00Z"), floorFor("2026-06-29"))).toEqual({
      inSession: false,
      returnDate: null,
    });
  });

  it("out of session when no House floor data is available", () => {
    expect(houseStatus(new Date("2026-07-09T12:00:00Z"), null).inSession).toBe(false);
  });
});
