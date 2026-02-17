export type ImeFixtureStep =
  | { kind: "compositionstart" }
  | { kind: "compositionupdate"; data: string }
  | { kind: "compositionend"; data: string }
  | { kind: "input"; data: string };

export interface ImeFixture {
  name: string;
  steps: ImeFixtureStep[];
  expectedWrites: string[];
}

export const imeFixtures: ImeFixture[] = [
  {
    name: "simple-commit",
    steps: [
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "にほんご" },
      { kind: "compositionend", data: "日本語" },
      { kind: "input", data: "日本語" },
    ],
    expectedWrites: ["日本語"],
  },
  {
    name: "reconversion-commit",
    steps: [
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "かんじ" },
      { kind: "compositionupdate", data: "漢字" },
      { kind: "compositionend", data: "漢字" },
      { kind: "input", data: "漢字" },
    ],
    expectedWrites: ["漢字"],
  },
  {
    name: "cancel-before-commit",
    steps: [
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "へんかん" },
      { kind: "compositionend", data: "" },
      { kind: "input", data: "" },
    ],
    expectedWrites: [],
  },
  {
    name: "mixed-latin-and-ime",
    steps: [
      { kind: "input", data: "a" },
      { kind: "input", data: "b" },
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "に" },
      { kind: "compositionend", data: "日" },
      { kind: "input", data: "日" },
      { kind: "input", data: "c" },
    ],
    expectedWrites: ["a", "b", "日", "c"],
  },
  {
    name: "compositionend-before-input",
    steps: [
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "にほん" },
      { kind: "compositionend", data: "日本" },
      { kind: "input", data: "日本" },
    ],
    expectedWrites: ["日本"],
  },
  {
    name: "input-before-compositionend",
    steps: [
      { kind: "compositionstart" },
      { kind: "compositionupdate", data: "へんかん" },
      { kind: "input", data: "変換" },
      { kind: "compositionend", data: "変換" },
    ],
    expectedWrites: ["変換"],
  },
];
