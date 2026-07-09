import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FloorSchedule } from "@/lib/floor-schedule";
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

    const link = screen.getByRole("link", { name: "H.R. 8873" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.congress.gov/bill/119th-congress/house-bill/8873",
    );
    expect(screen.getByText(/Recover COVID Unemployment Fraud/i)).toBeInTheDocument();

    expect(screen.getByText(/Monday, Jul 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/schedules change frequently/i)).toBeInTheDocument();
  });
});
