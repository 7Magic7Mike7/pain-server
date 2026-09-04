// Copyright © 2026 Michael Artner
import { randomInt } from "crypto";
import { LOGGER } from "./log-config";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789";
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
