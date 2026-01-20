import { describe, it, expect } from "vitest";
import { formatBytes } from "../RightPanel";

describe("RightPanel formatBytes", () => {
  it("formats bytes into readable strings", () => {
    expect(formatBytes(null)).toBe("Unknown");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });
});
