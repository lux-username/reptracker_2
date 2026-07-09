import { describe, expect, it } from "vitest";
import { mergeMeetings } from "./events-index";
import type { RawMeetingDetail } from "./decisions";

const NOW = new Date("2026-07-09T00:00:00Z");

function mtg(over: Partial<RawMeetingDetail> & { eventId: string }): RawMeetingDetail {
  return {
    type: "Meeting",
    title: `Meeting ${over.eventId}`,
    date: "2026-08-01T14:00:00Z",
    chamber: "House",
    committees: [{ name: "Agriculture", systemCode: "hsag00" }],
    ...over,
  };
}

describe("mergeMeetings", () => {
  it("keeps only future, live meetings", () => {
    const out = mergeMeetings(
      [],
      [
        mtg({ eventId: "future", date: "2026-08-01T14:00:00Z" }),
        mtg({ eventId: "past", date: "2026-01-01T14:00:00Z" }),
        mtg({ eventId: "canceled", date: "2026-08-02T14:00:00Z", meetingStatus: "Cancelled" }),
        mtg({ eventId: "postponed", date: "2026-08-03T14:00:00Z", meetingStatus: "Postponed" }),
        mtg({ eventId: "nodate", date: undefined }),
      ],
      NOW,
    );
    expect(out.map((m) => m.eventId)).toEqual(["future"]);
  });

  it("dedupes by eventId with the fresh read winning", () => {
    const existing = [mtg({ eventId: "e1", title: "old title", date: "2026-08-01T14:00:00Z" })];
    const fresh = [mtg({ eventId: "e1", title: "new title", date: "2026-08-05T14:00:00Z" })];
    const out = mergeMeetings(existing, fresh, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("new title");
    expect(out[0].date).toBe("2026-08-05T14:00:00Z");
  });

  it("prunes an existing meeting that has since been cancelled", () => {
    const existing = [mtg({ eventId: "e1", date: "2026-08-01T14:00:00Z" })];
    const fresh = [mtg({ eventId: "e1", date: "2026-08-01T14:00:00Z", meetingStatus: "Canceled" })];
    expect(mergeMeetings(existing, fresh, NOW)).toEqual([]);
  });

  it("prunes an existing meeting that has since passed, even without a fresh read", () => {
    const past = new Date("2026-09-01T00:00:00Z");
    const existing = [mtg({ eventId: "e1", date: "2026-08-01T14:00:00Z" })];
    expect(mergeMeetings(existing, [], past)).toEqual([]);
  });

  it("returns the merged set in chronological order", () => {
    const out = mergeMeetings(
      [mtg({ eventId: "late", date: "2026-09-01T14:00:00Z" })],
      [
        mtg({ eventId: "early", date: "2026-07-20T14:00:00Z" }),
        mtg({ eventId: "mid", date: "2026-08-10T14:00:00Z" }),
      ],
      NOW,
    );
    expect(out.map((m) => m.eventId)).toEqual(["early", "mid", "late"]);
  });

  it("drops meetings with no eventId (can't dedupe or key them)", () => {
    const out = mergeMeetings([], [mtg({ eventId: "" })], NOW);
    expect(out).toEqual([]);
  });
});
