import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/coordinate-computer", () => ({
  computeCoordinate: vi.fn().mockResolvedValue({ lat: 1.25, lng: 2.5 }),
}));

import { app } from "../src/app";
import { computeCoordinate } from "../src/coordinate-computer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /survey", () => {
  it("returns the generated paragraph with the existing computed coordinate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          paragraph: "Ice cracks beside the iron rail.",
          lat: 12.5,
          lng: -47.25,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const survey = {
      userId: "not-forwarded",
      consent: false,
      wordBubbles: ["anger", "grief"],
      wordBody: [{ word: "grief", lat: 12.5, lng: -47.25 }],
      temporality: ["years"],
      relations: ["my mother"],
      painDescription: "it does not stop",
    };

    const response = await request(app).post("/survey").send(survey).expect(200);

    expect(response.body).toEqual({
      lat: 1.25,
      lng: 2.5,
      text: "Ice cracks beside the iron rail.",
    });
    expect(computeCoordinate).toHaveBeenCalledWith(
      survey.wordBubbles,
      survey.wordBody,
      survey.temporality,
      survey.relations,
      survey.painDescription,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://pain-message:7246/survey");
    expect(JSON.parse(String(init.body))).toEqual({
      wordBubbles: survey.wordBubbles,
      wordBody: survey.wordBody,
      temporality: survey.temporality,
      relations: survey.relations,
      painDescription: survey.painDescription,
    });
  });

  it("rejects a response without a generated paragraph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paragraph: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await request(app).post("/survey").send({}).expect(500);
    expect(response.body.message).toBe("Failed to generate text from survey.");
  });
});
