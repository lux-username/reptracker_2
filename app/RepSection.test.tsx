import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RepSection, { Bills } from "./RepSection";
import type { Chamber, RepProfile, SecondaryBill } from "@/lib/types";
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
    upcomingDecisions: [],
    secondaryBills: [],
    ...overrides,
  };
}

describe("RepSection — recess pivot (Issue #8)", () => {
  it("shows no recess line when the chamber is in session", () => {
    const status: ChamberStatus = { inSession: true, returnDate: null };
    render(<RepSection profile={profile("house")} delegateBanner={null} chamberStatus={status} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // In-session-but-nothing-scheduled copy (#27 other branch).
    expect(
      screen.getByText(/No upcoming committee meetings scheduled for this rep right now/i),
    ).toBeInTheDocument();
  });

  it("leads a Senator's card with 'in recess until [date]' and ties the empty decisions to it", () => {
    const status: ChamberStatus = { inSession: false, returnDate: "2026-07-13" };
    render(<RepSection profile={profile("senate")} delegateBanner={null} chamberStatus={status} />);
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
    render(<RepSection profile={profile("house")} delegateBanner={null} chamberStatus={status} />);
    expect(screen.getByRole("status")).toHaveTextContent("The House is not currently in session.");
    expect(
      screen.getByText(/No committee meetings while the House is in recess/),
    ).toBeInTheDocument();
  });

  it("behaves exactly as before when no status is provided", () => {
    render(<RepSection profile={profile("house")} delegateBanner={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No upcoming committee meetings scheduled for this rep right now/i),
    ).toBeInTheDocument();
  });
});
