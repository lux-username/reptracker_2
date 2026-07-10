import { describe, expect, it } from "vitest";
import {
  buildUpcomingCommitteeActions,
  congressEventUrl,
  committeeActionRoleLabel,
  normalizeSystemCode,
} from "./committee-actions";
import type { RawMeetingDetail } from "./committee-actions";
import type { CommitteeAssignment } from "./types";

// Real Congress.gov meeting details + two synthetic HSAG meetings (Davids's
// full committee + a subcommittee she is ranking member of).
import meetingsFx from "./__fixtures__/committee-meetings.json";

const meetings = meetingsFx as RawMeetingDetail[];
const NOW = new Date("2026-07-08T00:00:00Z");

function assign(over: Partial<CommitteeAssignment> & { code: string }): CommitteeAssignment {
  return {
    name: over.code,
    role: "Member",
    isSubcommittee: false,
    parentName: null,
    parentCode: null,
    ...over,
  };
}

describe("normalizeSystemCode", () => {
  it("strips the trailing 00 of full committees, keeps subcommittee suffixes", () => {
    expect(normalizeSystemCode("hsag00")).toBe("HSAG");
    expect(normalizeSystemCode("hsag16")).toBe("HSAG16");
    expect(normalizeSystemCode("hlig00")).toBe("HLIG");
  });
});

describe("committeeActionRoleLabel", () => {
  it("labels full-committee and subcommittee roles structurally", () => {
    expect(committeeActionRoleLabel(assign({ code: "HSAG", role: "Chair" }))).toBe("Chair");
    expect(committeeActionRoleLabel(assign({ code: "HSAG", role: "Ranking Member" }))).toBe(
      "Ranking Member",
    );
    expect(committeeActionRoleLabel(assign({ code: "HSAG", role: "Member" }))).toBe("Committee Member");
    expect(
      committeeActionRoleLabel(assign({ code: "HSAG16", role: "Chair", isSubcommittee: true })),
    ).toBe("Subcommittee Chair");
    expect(
      committeeActionRoleLabel(
        assign({ code: "HSAG16", role: "Ranking Member", isSubcommittee: true }),
      ),
    ).toBe("Subcommittee Ranking Member");
  });
});

describe("congressEventUrl", () => {
  it("builds the public event page URL Congress.gov's API itself returns", () => {
    // Matches the `videos[].url` form on a live meeting detail, verified against
    // the Congress.gov API for both chambers (Issue #20).
    expect(congressEventUrl(119, "house", "119394")).toBe(
      "https://www.congress.gov/event/119th-Congress/house-event/119394",
    );
    expect(congressEventUrl(119, "senate", "338652")).toBe(
      "https://www.congress.gov/event/119th-Congress/senate-event/338652",
    );
  });

  it("uses the correct ordinal suffix per congress number", () => {
    expect(congressEventUrl(121, "house", "1")).toContain("121st-Congress");
    expect(congressEventUrl(122, "house", "1")).toContain("122nd-Congress");
    expect(congressEventUrl(123, "house", "1")).toContain("123rd-Congress");
    expect(congressEventUrl(113, "house", "1")).toContain("113th-Congress");
  });

  it("returns null when it can't build the URL (caller falls back)", () => {
    expect(congressEventUrl(undefined, "house", "119394")).toBeNull();
    expect(congressEventUrl(119, "house", "")).toBeNull();
  });
});

describe("buildUpcomingCommitteeActions", () => {
  const davids: CommitteeAssignment[] = [
    assign({ code: "HSAG", name: "House Committee on Agriculture", role: "Member" }),
    assign({
      code: "HSAG16",
      name: "General Farm Commodities, Risk Management, and Credit",
      role: "Ranking Member",
      isSubcommittee: true,
      parentCode: "HSAG",
      parentName: "House Committee on Agriculture",
    }),
  ];

  const out = buildUpcomingCommitteeActions(meetings, davids, NOW);

  it("keeps only meetings held by a committee the rep sits on", () => {
    const ids = out.map((d) => d.eventId);
    expect(ids).toContain("119500"); // hsag00 markup
    expect(ids).toContain("119501"); // hsag16 hearing
    // A House Intelligence hearing (hlig00) is not one of her committees.
    expect(ids).not.toContain("119456");
  });

  it("links each committee action to its specific event page, not the committee page (Issue #20)", () => {
    const markup = out.find((d) => d.eventId === "119500");
    expect(markup?.url).toBe(
      "https://www.congress.gov/event/119th-Congress/house-event/119500",
    );
    // No committee action should point at the generic committee landing page.
    expect(out.every((d) => !d.url.includes("/committee/"))).toBe(true);
  });

  it("falls back to the committee page when the event URL can't be built", () => {
    const noCongress: RawMeetingDetail[] = [
      {
        eventId: "119500",
        type: "Markup",
        title: "Markup missing congress",
        date: "2026-07-20T14:00:00Z",
        chamber: "House",
        committees: [{ name: "Ag", systemCode: "hsag00" }],
      },
    ];
    const [d] = buildUpcomingCommitteeActions(noCongress, davids, NOW);
    expect(d.url).toBe("https://www.congress.gov/committee/house-committee/hsag00");
  });

  it("labels each committee action with the rep's role on that committee", () => {
    expect(out.find((d) => d.eventId === "119500")?.roleLabel).toBe("Committee Member");
    expect(out.find((d) => d.eventId === "119501")?.roleLabel).toBe(
      "Subcommittee Ranking Member",
    );
  });

  it("orders committee actions chronologically", () => {
    const dates = out.map((d) => Date.parse(d.date));
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it("excludes past meetings", () => {
    const pastNow = new Date("2027-01-01T00:00:00Z");
    expect(buildUpcomingCommitteeActions(meetings, davids, pastNow)).toHaveLength(0);
  });

  it("excludes canceled/postponed meetings", () => {
    const canceled: RawMeetingDetail[] = [
      {
        eventId: "x",
        type: "Markup",
        title: "Canceled markup",
        meetingStatus: "Canceled",
        date: "2026-07-20T14:00:00Z",
        chamber: "House",
        committees: [{ name: "Ag", systemCode: "hsag00" }],
      },
    ];
    expect(buildUpcomingCommitteeActions(canceled, davids, NOW)).toHaveLength(0);
  });

  it("returns nothing for a rep with no matching committees", () => {
    expect(buildUpcomingCommitteeActions(meetings, [assign({ code: "SSXX" })], NOW)).toHaveLength(0);
  });
});
