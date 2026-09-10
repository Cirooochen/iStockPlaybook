import { describe, expect, it } from "vitest";
import { deriveThesisHealth, isThesisEligibleForAdd } from "@/domain/thesis/thesis";
import type { ThesisHealth } from "@/types/playbook";

describe("deriveThesisHealth", () => {
  const cases: ThesisHealth[] = [
    "STRENGTHENING",
    "INTACT",
    "MIXED",
    "WEAKENING",
    "BROKEN",
  ];

  it.each(cases)("passes %s through unchanged", (value) => {
    expect(deriveThesisHealth(value)).toBe(value);
  });
});

// Spec §22 thesis-eligibility clause — v0.1 decision (B.5.5).
describe("isThesisEligibleForAdd", () => {
  it.each<[ThesisHealth, boolean]>([
    ["STRENGTHENING", true],
    ["INTACT", true],
    ["MIXED", false],
    ["WEAKENING", false],
    ["BROKEN", false],
  ])("%s → %s", (health, expected) => {
    expect(isThesisEligibleForAdd(health)).toBe(expected);
  });
});
