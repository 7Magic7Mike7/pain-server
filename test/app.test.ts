/*
 * File attribution
 * edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 * changes: +13 / -8 lines (excluding attribution)
 * baseline: 686059eea3cb (security before PR #12)
 */
// Copyright © 2026 Michael Artner
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
vi.mock("../src/loader/db-loader", () => ({
  registerUser: vi.fn().mockResolvedValueOnce("first-user").mockResolvedValueOnce("second-user"),
}));
import { app } from "../src/app";
import { getAllLayerInfo } from "../src/config/layer-config";
import { registerUser } from "../src/loader/db-loader";

describe("API", () => {
  it("registers each /init request instead of serving a cached registration", async () => {
    const first = await request(app).get("/init").expect(200);
    const second = await request(app).get("/init").expect(200);
    expect(first.body.userId).toBe("first-user");
    expect(second.body.userId).toBe("second-user");
    expect(registerUser).toHaveBeenCalledTimes(2);
    const actLayers = first.body.layerInfo;
    const expLayers = getAllLayerInfo();
    expect(Array.isArray(actLayers)).toBeTruthy();
    expect(actLayers.length).toEqual(expLayers.length);
    for (let i = 0; i < expLayers.length; i++) {
      expect(actLayers[i].id).toBe(expLayers[i].id);
    }
  });
});
