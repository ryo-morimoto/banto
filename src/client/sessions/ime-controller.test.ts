import { describe, expect, it } from "bun:test";
import { createImeController, type ImeControllerEvent } from "./ime-controller.ts";
import { imeFixtures, type ImeFixture } from "./ime-fixtures.ts";

function replayFixture(controller: ReturnType<typeof createImeController>, fixture: ImeFixture) {
  for (const step of fixture.steps) {
    controller.handle(step);
  }
}

describe("imeFixtures", () => {
  it("contains canonical composition flow fixtures", () => {
    expect(imeFixtures.map((fixture) => fixture.name)).toEqual([
      "simple-commit",
      "reconversion-commit",
      "cancel-before-commit",
      "mixed-latin-and-ime",
      "compositionend-before-input",
      "input-before-compositionend",
    ]);
  });
});

describe("createImeController", () => {
  it("commits fixture output in lifecycle order", () => {
    const writes: string[] = [];
    const controller = createImeController((text) => writes.push(text));

    const simple = imeFixtures.find((fixture) => fixture.name === "simple-commit");
    expect(simple).toBeDefined();
    replayFixture(controller, simple!);

    expect(writes).toEqual(["日本語"]);
  });

  it("does not emit writes when composition is canceled", () => {
    const writes: string[] = [];
    const controller = createImeController((text) => writes.push(text));

    const canceled = imeFixtures.find((fixture) => fixture.name === "cancel-before-commit");
    expect(canceled).toBeDefined();
    replayFixture(controller, canceled!);

    expect(writes).toEqual([]);
  });

  it("commits exactly once when compositionend happens before input", () => {
    const writes: string[] = [];
    const controller = createImeController((text) => writes.push(text));

    const fixture = imeFixtures.find((item) => item.name === "compositionend-before-input");
    expect(fixture).toBeDefined();
    replayFixture(controller, fixture!);

    expect(writes).toEqual(["日本"]);
  });

  it("commits exactly once when input happens before compositionend", () => {
    const writes: string[] = [];
    const controller = createImeController((text) => writes.push(text));

    const fixture = imeFixtures.find((item) => item.name === "input-before-compositionend");
    expect(fixture).toBeDefined();
    replayFixture(controller, fixture!);

    expect(writes).toEqual(["変換"]);
  });

  it("passes non-composition input through immediately", () => {
    const writes: string[] = [];
    const controller = createImeController((text) => writes.push(text));

    const events: ImeControllerEvent[] = [
      { kind: "input", data: "a" },
      { kind: "input", data: "b" },
    ];

    for (const event of events) {
      controller.handle(event);
    }

    expect(writes).toEqual(["a", "b"]);
  });
});
