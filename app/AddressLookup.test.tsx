import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LookupResult } from "@/lib/types";

// The floor section (Issue #33) is passed as children and revealed only once a
// lookup resolves. Mock the server actions so the component never hits the network.
const resolved: LookupResult = {
  status: "resolved",
  reps: {
    state: "KS",
    district: 2,
    congress: 119,
    nonVoting: false,
    delegateBanner: null,
    houseMember: null,
    senators: [],
  },
};

vi.mock("./actions", () => ({
  lookupAction: vi.fn(async () => resolved),
  resolveCandidateAction: vi.fn(),
  buildProfilesAction: vi.fn(async () => []),
}));

import AddressLookup from "./AddressLookup";

const FLOOR = <div data-testid="floor-section">On the floor this week</div>;

describe("AddressLookup floor gating (#33)", () => {
  it("hides the floor section before any lookup", () => {
    render(<AddressLookup>{FLOOR}</AddressLookup>);
    expect(screen.getByLabelText(/your address/i)).toBeInTheDocument();
    expect(screen.queryByTestId("floor-section")).not.toBeInTheDocument();
  });

  it("reveals the floor section after a lookup resolves", async () => {
    render(<AddressLookup>{FLOOR}</AddressLookup>);
    fireEvent.change(screen.getByLabelText(/your address/i), {
      target: { value: "123 Main St, Wichita, KS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find my reps/i }));
    await waitFor(() =>
      expect(screen.getByTestId("floor-section")).toBeInTheDocument(),
    );
  });
});
