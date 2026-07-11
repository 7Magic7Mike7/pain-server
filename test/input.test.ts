import { describe, it, expect } from "vitest";
import { PainDbConfig } from "../src/config/db-config";
import { parsePainOrigin } from "../src/validation/input-validator";

describe("pain origin", () => {
  describe("valid", () => {
    it("DbConfig constants", () => {
      const origins: string[] = [
        PainDbConfig.TN_EMO,
        PainDbConfig.TN_ENV,
        PainDbConfig.TN_PHYS,
        PainDbConfig.TN_SOCIOECO
      ];
      for (const origin of origins) {
        const result = parsePainOrigin(origin);
        expect(result, `origin=${origin} must not result in null!`).not.toBeNull();
        expect(result?.length, `origin=${origin} must yield a result!`).toBeGreaterThan(0);
      }
    });
    it("DbConfig constants lower case", () => {
      const origins: string[] = [
        PainDbConfig.TN_EMO,
        PainDbConfig.TN_ENV,
        PainDbConfig.TN_PHYS,
        PainDbConfig.TN_SOCIOECO
      ];
      for (const origin of origins) {
        const lcOrigin = origin.toLowerCase();
        const result = parsePainOrigin(lcOrigin);
        expect(result, `origin=${lcOrigin} must not result in null!`).not.toBeNull();
        expect(result?.length, `origin=${lcOrigin} must yield a result!`).toBeGreaterThan(0);
      }
    });
  });
  
  describe("invalid", () => {
    it("empty origin", () => {
      const origin = "";
      const result = parsePainOrigin(origin);
      expect(result, `string origin must not result in null!`).toBeNull();
    });
    it("non-existent origin", () => {
      const origin = "layer";
      const result = parsePainOrigin(origin);
      expect(result, `string origin must not result in null!`).toBeNull();
    });
  });
});
