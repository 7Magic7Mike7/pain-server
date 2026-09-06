// Copyright © 2026 Michael Artner
import { describe, it, expect, beforeAll } from "vitest";
import { PainDbConfig, UserDbConfig } from "../src/config/db-config";
import { parsePainOrigin } from "../src/validation/input-validator";
import { storeUserCoordinate } from "../src/loader/db-loader";
import { fail } from "node:assert";
import { generateUserId, validateUserId } from "../src/config/user-config";

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

describe("database calls", () => {
  const userId = "mockuser";
  describe("invalid", () => {
    describe("User Coordinates", () => {
      it("too small latitude", async () => {
        const coordiante = { lat: UserDbConfig.VAL_LAT_MIN - 1, lng: UserDbConfig.VAL_LNG_MIN };
        try {
          await storeUserCoordinate(userId, coordiante);
          fail();
        }
        catch (error) { }
      });
    });
  });
});

describe("userId validation", () => {
  const USER_ID_LENGTH = 16;
  describe("valid", () => {
    it("validate generated ids", () => {
      for (let index = 0; index < 10_000; index++) {
        const userId = generateUserId();
        expect(validateUserId(userId)).toBeTruthy();
      }
    });
  });
  describe("invalid", () => {
    it("id too short", () => {
      let userId = "";
      for (let i = 0; i < USER_ID_LENGTH-1; i++) {
        userId += "a";
      }
      expect(validateUserId(userId)).toBeFalsy();
    });
    it("id too long", () => {
      let userId = "";
      for (let i = 0; i < USER_ID_LENGTH+1; i++) {
        userId += "a";
      }
      expect(validateUserId(userId)).toBeFalsy();
    });
    it("id containing illegal characters", () => {
      let userId = "";
      for (let i = 0; i < USER_ID_LENGTH-1; i++) {
        userId += "a";
      }
      const testCharacters = "_;-+%&/\\,.!\"\'\´()[]{}";
      for (let i = 0; i < testCharacters.length; i++) {
        const char = testCharacters[i];
        expect(validateUserId(userId + char)).toBeFalsy();
      }
    });
  });
})
