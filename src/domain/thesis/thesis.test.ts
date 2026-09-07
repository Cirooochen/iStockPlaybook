import { describe, expect, it } from "vitest";
import { deriveThesisHealth } from "@/domain/thesis/thesis";
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
