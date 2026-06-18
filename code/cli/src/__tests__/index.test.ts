import { describe, it, expect } from "vitest";
import { createProgram } from "../index.js";

describe("tmf CLI", () => {
  it("creates a commander program named tmf", () => {
    const program = createProgram();
    expect(program.name()).toBe("tmf");
  });

  it("has a description", () => {
    const program = createProgram();
    expect(program.description()).toContain("Token魔方");
  });
});
