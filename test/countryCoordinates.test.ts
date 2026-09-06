// Copyright © 2026 Michael Artner
import { describe, it, expect } from "vitest";
import { countryToCoordinate } from "../src/config/country-coordinate-config";

describe("Test countryToCoordinate()", () => {
  describe("valid", () => {
    it("AUT", () => {
      const res = countryToCoordinate("AUT");
      expect(res).toBeDefined();
      expect(res?.lat).toBeCloseTo(48.2, 2);
      expect(res?.lng).toBeCloseTo(16.37, 2);
    });
    it("GRC", () => {
      const res = countryToCoordinate("GRC");
      expect(res).toBeDefined();
      expect(res?.lat).toBeCloseTo(37.98, 2);
      expect(res?.lng).toBeCloseTo(23.73, 2);
    });
  });
  describe("invalid", () => {
    it("wrong country code", () => {
      const res = countryToCoordinate("AT");
      expect(res).toBeUndefined();
    });
  });
});
