import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Bills } from "./RepSection";
import type { SecondaryBill } from "@/lib/types";

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
