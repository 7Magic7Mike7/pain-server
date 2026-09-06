// Copyright © 2026 Michael Artner
import { randomInt } from "crypto";
import { LOGGER } from "./log-config";
import { isValidString } from "../validation/input-validator";

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

export function validateUserId(userId: any): boolean {
  // check type
  if (typeof userId !== "string") {
    return false;
  }
  // check for correct length
  if (userId.length != USER_ID_LENGTH) {
    return false;
  }
  // check for any non-supported characters
  if (!isValidString(userId)) {
    return false;
  }
  return true;
}
