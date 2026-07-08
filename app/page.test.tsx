import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the app heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /representative tracker/i }),
    ).toBeInTheDocument();
  });
});
