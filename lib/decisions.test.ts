import { describe, expect, it } from "vitest";
import {
  buildUpcomingDecisions,
  decisionRoleLabel,
  normalizeSystemCode,
} from "./decisions";
import type { RawMeetingDetail } from "./decisions";
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

describe("decisionRoleLabel", () => {
  it("labels full-committee and subcommittee roles structurally", () => {
    expect(decisionRoleLabel(assign({ code: "HSAG", role: "Chair" }))).toBe("Chair");
    expect(decisionRoleLabel(assign({ code: "HSAG", role: "Ranking Member" }))).toBe(
      "Ranking Member",
    );
    expect(decisionRoleLabel(assign({ code: "HSAG", role: "Member" }))).toBe("Committee Member");
    expect(
      decisionRoleLabel(assign({ code: "HSAG16", role: "Chair", isSubcommittee: true })),
    ).toBe("Subcommittee Chair");
    expect(
      decisionRoleLabel(
        assign({ code: "HSAG16", role: "Ranking Member", isSubcommittee: true }),
      ),
    ).toBe("Subcommittee Ranking Member");
  });
});

describe("buildUpcomingDecisions", () => {
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

  const out = buildUpcomingDecisions(meetings, davids, NOW);

  it("keeps only meetings held by a committee the rep sits on", () => {
    const ids = out.map((d) => d.eventId);
    expect(ids).toContain("119500"); // hsag00 markup
    expect(ids).toContain("119501"); // hsag16 hearing
    // A House Intelligence hearing (hlig00) is not one of her committees.
    expect(ids).not.toContain("119456");
  });

  it("labels each decision with the rep's role on that committee", () => {
    expect(out.find((d) => d.eventId === "119500")?.roleLabel).toBe("Committee Member");
    expect(out.find((d) => d.eventId === "119501")?.roleLabel).toBe(
      "Subcommittee Ranking Member",
    );
  });

  it("orders decisions chronologically", () => {
    const dates = out.map((d) => Date.parse(d.date));
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it("excludes past meetings", () => {
    const pastNow = new Date("2027-01-01T00:00:00Z");
    expect(buildUpcomingDecisions(meetings, davids, pastNow)).toHaveLength(0);
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
    expect(buildUpcomingDecisions(canceled, davids, NOW)).toHaveLength(0);
  });

  it("returns nothing for a rep with no matching committees", () => {
    expect(buildUpcomingDecisions(meetings, [assign({ code: "SSXX" })], NOW)).toHaveLength(0);
  });
});
