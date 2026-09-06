// Copyright © 2026 Michael Artner
import { describe, it, expect, beforeAll } from "vitest";
import { PainDbConfig, UserDbConfig } from "../src/config/db-config";
import { isValidString, parsePainOrigin } from "../src/validation/input-validator";
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

describe("isValidString", () => {
  describe("valid", () => {
    it("allow all", () => {
      const text = "aA9 -";
      expect(isValidString(text, true, true, true, true, true)).toBeTruthy();
    });
  });
  describe("invalid", () => {
    it("allowLower", () => {
      expect(isValidString("a", true, false, false, false, false)).toBeTruthy();
      expect(isValidString("A", true, false, false, false, false)).toBeFalsy();
      expect(isValidString("9", true, false, false, false, false)).toBeFalsy();
      expect(isValidString("-", true, false, false, false, false)).toBeFalsy();
      expect(isValidString(" ", true, false, false, false, false)).toBeFalsy();
    });
    it("allowUpper", () => {
      expect(isValidString("a", false, true, false, false, false)).toBeFalsy();
      expect(isValidString("A", false, true, false, false, false)).toBeTruthy();
      expect(isValidString("9", false, true, false, false, false)).toBeFalsy();
      expect(isValidString("-", false, true, false, false, false)).toBeFalsy();
      expect(isValidString(" ", false, true, false, false, false)).toBeFalsy();
    });
    it("allowNumber", () => {
      expect(isValidString("a", false, false, true, false, false)).toBeFalsy();
      expect(isValidString("A", false, false, true, false, false)).toBeFalsy();
      expect(isValidString("9", false, false, true, false, false)).toBeTruthy();
      expect(isValidString("-", false, false, true, false, false)).toBeFalsy();
      expect(isValidString(" ", false, false, true, false, false)).toBeFalsy();
    });
    it("allowDash", () => {
      expect(isValidString("a", false, false, false, true, false)).toBeFalsy();
      expect(isValidString("A", false, false, false, true, false)).toBeFalsy();
      expect(isValidString("9", false, false, false, true, false)).toBeFalsy();
      expect(isValidString("-", false, false, false, true, false)).toBeTruthy();
      expect(isValidString(" ", false, false, false, true, false)).toBeFalsy();
    });
    it("allowWhitespace", () => {
      expect(isValidString("a", false, false, false, false, true)).toBeFalsy();
      expect(isValidString("A", false, false, false, false, true)).toBeFalsy();
      expect(isValidString("9", false, false, false, false, true)).toBeFalsy();
      expect(isValidString("-", false, false, false, false, true)).toBeFalsy();
      expect(isValidString(" ", false, false, false, false, true)).toBeTruthy();
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
      const testCharacters = "_;-+%&/\\,.!\"\'\´()[]{} ";
      for (let i = 0; i < testCharacters.length; i++) {
        const char = testCharacters[i];
        expect(validateUserId(userId + char)).toBeFalsy();
      }
    });
  });
});
