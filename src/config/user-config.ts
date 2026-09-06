// Copyright © 2026 Michael Artner
import { randomInt } from "crypto";
import { LOGGER } from "./log-config";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const USER_ID_LENGTH = 16;

const logger = LOGGER.child({ service: "UserConfig" });

/**
 * Generates a user id consisting of multiple case-sensitive alphanumerical characters.
 * 
 * @returns a hard to predict random user id
 */
export function generateUserId(): string {
  const userId = Array.from(
    { length: USER_ID_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("");
  logger.debug(`Generated userId = ${userId}`);
  return userId;
}

export function validateUserId(userId: string): boolean {
  // check for correct length
  if (userId.length != USER_ID_LENGTH) {
    return false;
  }
  // check for any non-supported characters
  if (!isAlphaNumeric(userId)) {
    return false;
  }
  return true;
}

// Source - https://stackoverflow.com/a/25352300
// Posted by Michael Martin-Smucker
// Retrieved 2026-09-06, License - CC BY-SA 3.0

function isAlphaNumeric(userId: string) {
  let code, i, len;
  for (i = 0, len = userId.length; i < len; i++) {
    code = userId.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
};
