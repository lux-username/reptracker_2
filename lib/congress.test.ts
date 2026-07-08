import { describe, expect, it } from "vitest";
import { selectReps } from "./congress";

// Real Congress.gov /member/congress/119/{state} payloads.
import ks from "./__fixtures__/congress-KS.json";
import wy from "./__fixtures__/congress-WY.json";
import dc from "./__fixtures__/congress-DC.json";
import pr from "./__fixtures__/congress-PR.json";

const members = (fixture: unknown) => (fixture as { members: unknown[] }).members as never[];

describe("selectReps", () => {
  it("picks the correct House member for a numbered district + both senators", () => {
    const { houseMember, senators } = selectReps(members(ks), "KS", 2);
    expect(houseMember?.bioguideId).toBe("S001228"); // Schmidt, KS-02
    expect(houseMember?.chamber).toBe("house");
    expect(houseMember?.houseRole).toBe("representative");
    expect(senators).toHaveLength(2);
    expect(senators.every((s) => s.chamber === "senate" && s.district === null)).toBe(true);
    expect(senators.map((s) => s.bioguideId).sort()).toEqual(["M000934", "M001198"]);
  });

  it("does not return a House member for a district the state doesn't have", () => {
    const { houseMember } = selectReps(members(ks), "KS", 9);
    expect(houseMember).toBeNull();
  });

  it("resolves a voting at-large state (WY, district 0) to its lone House member + senators", () => {
    const { houseMember, senators } = selectReps(members(wy), "WY", 0);
    expect(houseMember?.bioguideId).toBe("H001096"); // Hageman
    expect(houseMember?.houseRole).toBe("representative");
    expect(senators).toHaveLength(2);
  });

  it("resolves DC's delegate at district 0 with no senators", () => {
    const { houseMember, senators } = selectReps(members(dc), "DC", 0);
    expect(houseMember?.bioguideId).toBe("N000147"); // Norton
    expect(houseMember?.houseRole).toBe("delegate");
    expect(senators).toEqual([]);
  });

  it("resolves PR's resident commissioner at district 0 with no senators", () => {
    const { houseMember, senators } = selectReps(members(pr), "PR", 0);
    expect(houseMember?.houseRole).toBe("resident-commissioner");
    expect(senators).toEqual([]);
  });
});
