import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Home is an async server component that fetches the floor schedule; stub it so
// the test never touches the network or KV.
vi.mock("@/lib/floor-schedule", () => ({ getFloorSchedule: vi.fn(async () => null) }));

import Home from "./page";

describe("Home page", () => {
  it("renders the app heading", async () => {
    render(await Home());
    expect(
      screen.getByRole("heading", { name: /representative tracker/i }),
    ).toBeInTheDocument();
  });
});
