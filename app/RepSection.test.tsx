import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RepSection, { Bills } from "./RepSection";
import type { Chamber, CommitteeAssignment, RepProfile, SecondaryBill } from "@/lib/types";
import type { ChamberStatus } from "@/lib/session-status";

function bill(overrides: Partial<SecondaryBill> = {}): SecondaryBill {
  return {
    billId: "hr-9425-119",
    displayId: "H.R. 9425",
    congress: 119,
    type: "HR",
    number: "9425",
    title: "Increasing Tribal Input on Nutrition Act of 2026",
    introducedDate: "2026-06-01",
    latestActionDate: null,
    latestActionText: null,
    policyArea: null,
    badge: "Primary sponsor",
    url: "https://www.congress.gov/bill/119th-congress/house-bill/9425",
    ...overrides,
  };
}

describe("Bills — summary states", () => {
  it("shows the CRS attribution when a summary is present", () => {
    render(<Bills bills={[bill({ summary: "Requires the Secretary to consult tribes." })]} />);
    expect(screen.getByText(/Congressional Research Service/i)).toBeInTheDocument();
    // The no-summary note must not appear when a summary exists.
    expect(screen.queryByText(/A summary is in progress/i)).not.toBeInTheDocument();
  });

  it("shows a source-attributed note for structured-only (null summary) bills", () => {
    // null summary ⇒ structured-only; quote Congress.gov's own wording (verified
    // live against H.R.9425), attributed as the source's status — not ours.
    render(<Bills bills={[bill({ summary: null })]} />);
    expect(screen.getByText(/A summary is in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Congress\.gov notes/i)).toBeInTheDocument();
    // Title and link stay exactly as-is — the note only fills the empty branch.
    expect(screen.getByRole("link", { name: /H\.R\. 9425/ })).toHaveAttribute(
      "href",
      "https://www.congress.gov/bill/119th-congress/house-bill/9425",
    );
  });
});

describe("Bills — policy-area tag (#36)", () => {
  it("renders the policy area as a topic tag when present", () => {
    render(<Bills bills={[bill({ policyArea: "Health" })]} />);
    expect(screen.getByText("Health")).toBeInTheDocument();
  });

  it("omits the tag when policyArea is null", () => {
    const { container } = render(<Bills bills={[bill({ policyArea: null })]} />);
    // Only the sponsor badge chip renders, not a second (topic) chip.
    expect(container.querySelectorAll("span.bg-slate-100")).toHaveLength(0);
  });
});

function profile(chamber: Chamber, overrides: Partial<RepProfile> = {}): RepProfile {
  return {
    rep: {
      bioguideId: "S001227",
      name: "Schmidt, Derek",
      party: "Republican",
      state: "KS",
      chamber,
      district: chamber === "house" ? 2 : null,
      houseRole: chamber === "house" ? "representative" : null,
      imageUrl: null,
    },
    committees: [],
    contact: {
      dcOfficePhone: "(202) 225-6601",
      dcOfficeAddress: null,
      districtOfficePhone: null,
      districtOfficeAddress: null,
      websiteUrl: null,
    },
    upcomingCommitteeActions: [],
    secondaryBills: [],
    ...overrides,
  };
}

describe("RepSection — recess pivot (Issue #8)", () => {
  it("shows no recess line when the chamber is in session", () => {
    const status: ChamberStatus = { inSession: true, returnDate: null };
    render(<RepSection profile={profile("house")} congress={119} delegateBanner={null} chamberStatus={status} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // In-session-but-nothing-scheduled copy (#27 other branch).
    expect(
      screen.getByText(/No upcoming committee meetings scheduled for this rep right now/i),
    ).toBeInTheDocument();
  });

  it("leads a Senator's card with 'in recess until [date]' and ties the empty committee action to it", () => {
    const status: ChamberStatus = { inSession: false, returnDate: "2026-07-13" };
    render(<RepSection profile={profile("senate")} congress={119} delegateBanner={null} chamberStatus={status} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The Senate is in recess until July 13, 2026.",
    );
    expect(
      screen.getByText(/No committee meetings while the Senate is in recess/),
    ).toBeInTheDocument();
    // The contact block is still present as the point of action.
    expect(screen.getByRole("link", { name: /\(202\) 225-6601/ })).toBeInTheDocument();
  });

  it("degrades to 'not currently in session' for the House (no return date)", () => {
    const status: ChamberStatus = { inSession: false, returnDate: null };
    render(<RepSection profile={profile("house")} congress={119} delegateBanner={null} chamberStatus={status} />);
    expect(screen.getByRole("status")).toHaveTextContent("The House is not currently in session.");
    expect(
      screen.getByText(/No committee meetings while the House is in recess/),
    ).toBeInTheDocument();
  });

  it("behaves exactly as before when no status is provided", () => {
    render(<RepSection profile={profile("house")} congress={119} delegateBanner={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No upcoming committee meetings scheduled for this rep right now/i),
    ).toBeInTheDocument();
  });
});

describe("RepSection — committee docket expander (Issue #21)", () => {
  const committee = (over: Partial<CommitteeAssignment>): CommitteeAssignment => ({
    code: "HSAG",
    name: "House Committee on Agriculture",
    role: "Member",
    isSubcommittee: false,
    parentName: null,
    parentCode: null,
    ...over,
  });

  it("renders a 'bills waiting' expander for each full committee and subcommittee", () => {
    const p = profile("house", {
      committees: [
        committee({}),
        committee({
          code: "HSAG16",
          name: "Subcommittee on Nutrition",
          isSubcommittee: true,
          parentCode: "HSAG",
        }),
      ],
    });
    render(<RepSection profile={p} congress={119} delegateBanner={null} />);
    // One expander per committee assignment (full + subcommittee).
    expect(screen.getAllByRole("button", { name: /bills waiting in this committee/i })).toHaveLength(
      2,
    );
  });

  it("omits the expander for a joint committee (no single chamber to query)", () => {
    const p = profile("house", {
      committees: [committee({ code: "JSPR", name: "Joint Committee on Printing" })],
    });
    render(<RepSection profile={p} congress={119} delegateBanner={null} />);
    expect(
      screen.queryByRole("button", { name: /bills waiting in this committee/i }),
    ).not.toBeInTheDocument();
    // The committee itself still lists.
    expect(screen.getByText("Joint Committee on Printing")).toBeInTheDocument();
  });
});
