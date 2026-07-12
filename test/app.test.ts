import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { getAllLayerInfo } from "../src/config/layer-config";

describe("API", () => {
  it("/init", async () => {
    const response = await request(app)
      .get("/init")
      .expect(200);

    const actLayers = response.body;
    const expLayers = getAllLayerInfo();
    expect(Array.isArray(actLayers)).toBeTruthy();
    expect(actLayers.length).toEqual(expLayers.length);
    for (let i = 0; i < expLayers.length; i++) {
      expect(actLayers[i].id == expLayers[i].id);
    }
  });
});
