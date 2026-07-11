import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FloorSchedule } from "@/lib/floor-schedule";
import type { SessionStatus } from "@/lib/session-status";
import FloorThisWeek from "./FloorThisWeek";

const sample: FloorSchedule = {
  builtAt: "2026-06-30T14:43:32.530Z",
  house: {
    weekOf: "2026-06-29",
    updatedAt: "2026-06-30T14:43:32.530",
    congress: 119,
    categories: [
      {
        heading: "Items that may be considered under suspension of the rules",
        bills: [
          {
            legisNum: "H.R. 8873",
            title: "Recover COVID Unemployment Fraud in Banks Act, as amended",
            url: "https://www.congress.gov/bill/119th-congress/house-bill/8873",
          },
        ],
      },
    ],
  },
  senate: { date: "Monday, Jul 13, 2026", note: "Convene at 3:00 p.m." },
};

describe("FloorThisWeek", () => {
  it("renders nothing when there is no data", () => {
    const { container } = render(<FloorThisWeek data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when both chambers are empty", () => {
    const { container } = render(
      <FloorThisWeek data={{ builtAt: "2026-06-30T00:00:00Z", house: null, senate: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows House bills linked to Congress.gov, the Senate note, and a freshness stamp", () => {
    render(<FloorThisWeek data={sample} />);

    expect(screen.getByRole("heading", { name: /on the floor this week/i })).toBeInTheDocument();
    expect(screen.getByText(/week of June 29, 2026/i)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /H\.R\. 8873/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.congress.gov/bill/119th-congress/house-bill/8873",
    );
    // External links open in a new tab and say so for screen-reader users (Issue #9).
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName(/opens in new tab/i);
    expect(screen.getByText(/Recover COVID Unemployment Fraud/i)).toBeInTheDocument();

    expect(screen.getByText(/Monday, Jul 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/schedules change frequently/i)).toBeInTheDocument();
  });

  const bothInSession: SessionStatus = {
    builtAt: "2026-06-30T00:00:00Z",
    house: { inSession: true, returnDate: null },
    senate: { inSession: true, returnDate: null },
  };

  it("in session, renders schedules as normal", () => {
    render(<FloorThisWeek data={sample} session={bothInSession} />);
    expect(screen.getByText(/week of June 29, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/in recess/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not currently in session/i)).not.toBeInTheDocument();
  });

  it("in recess, replaces the stale schedule with a factual not-in-session line", () => {
    const recess: SessionStatus = {
      builtAt: "2026-07-09T00:00:00Z",
      house: { inSession: false, returnDate: null },
      senate: { inSession: false, returnDate: "2026-07-13" },
    };
    render(<FloorThisWeek data={sample} session={recess} />);

    // The stale House week list must NOT show; the recess line does.
    expect(screen.queryByRole("link", { name: "H.R. 8873" })).not.toBeInTheDocument();
    expect(screen.getByText("The House is not currently in session.")).toBeInTheDocument();
    // Senate has a return date → "in recess until [date]".
    expect(screen.getByText("The Senate is in recess until July 13, 2026.")).toBeInTheDocument();
    // The old convene note is gone.
    expect(screen.queryByText(/Convene at 3:00 p.m./)).not.toBeInTheDocument();
  });

  it("renders the recess section even with no scraped data", () => {
    const recess: SessionStatus = {
      builtAt: "2026-07-09T00:00:00Z",
      house: { inSession: false, returnDate: null },
      senate: { inSession: false, returnDate: null },
    };
    render(<FloorThisWeek data={null} session={recess} />);
    expect(screen.getByText("The House is not currently in session.")).toBeInTheDocument();
    expect(screen.getByText("The Senate is not currently in session.")).toBeInTheDocument();
  });
});
