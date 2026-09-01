import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { app } from "../src/app";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /survey", () => {
  it("returns the generated paragraph and message-service coordinate", async () => {
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
      lat: 12.5,
      lng: -47.25,
      text: "Ice cracks beside the iron rail.",
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://pain-message:7246/survey");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      wordBubbles: survey.wordBubbles,
      wordBody: survey.wordBody,
      temporality: survey.temporality,
      relations: survey.relations,
      painDescription: survey.painDescription,
    });
  });

  it.each([400, 413])("preserves an upstream %i without exposing its body", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private upstream detail", { status })),
    );

    const response = await request(app).post("/survey").send({}).expect(status);

    expect(response.body).toEqual({ message: "Failed to generate survey message." });
    expect(JSON.stringify(response.body)).not.toContain("private upstream detail");
  });

  it("returns 502 for an invalid message-service response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paragraph: "", lat: 91, lng: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await request(app).post("/survey").send({}).expect(502);

    expect(response.body).toEqual({ message: "Failed to generate survey message." });
  });

  it("returns 502 when the message service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const response = await request(app).post("/survey").send({}).expect(502);

    expect(response.body).toEqual({ message: "Failed to generate survey message." });
  });
});
