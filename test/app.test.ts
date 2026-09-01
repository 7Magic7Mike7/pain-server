// Copyright © 2026 Michael Artner
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { getAllLayerInfo } from "../src/config/layer-config";

vi.mock("../src/loader/db-loader", async () => {
  const actual = await vi.importActual<typeof import("../src/loader/db-loader")>(
    "../src/loader/db-loader",
  );
  return {
    ...actual,
    registerUser: vi.fn().mockResolvedValue("test-user-id"),
  };
});

import { app } from "../src/app";

describe("API", () => {
  it("/init", async () => {
    const response = await request(app)
      .get("/init")
      .expect(200);

    const actLayers = response.body.layerInfo;
    const expLayers = getAllLayerInfo();
    expect(response.body.userId).toEqual(expect.any(String));
    expect(Array.isArray(actLayers)).toBeTruthy();
    expect(actLayers.length).toEqual(expLayers.length);
    for (let i = 0; i < expLayers.length; i++) {
      expect(actLayers[i].id).toBe(expLayers[i].id);
    }
  });
});
