import type { ImeFixtureStep } from "./ime-fixtures.ts";

export type ImeControllerEvent = ImeFixtureStep;

export function createImeController(onCommit: (text: string) => void) {
  let isComposing = false;
  let pendingCommit: string | null = null;
  let inputSeenDuringComposition = false;

  const flushCommit = (value: string) => {
    if (!value) return;
    onCommit(value);
    pendingCommit = null;
  };

  return {
    handle(event: ImeControllerEvent) {
      switch (event.kind) {
        case "compositionstart": {
          isComposing = true;
          pendingCommit = null;
          inputSeenDuringComposition = false;
          return;
        }

        case "compositionupdate": {
          return;
        }

        case "compositionend": {
          isComposing = false;
          pendingCommit = event.data;
          if (inputSeenDuringComposition) {
            flushCommit(pendingCommit);
          }
          return;
        }

        case "input": {
          if (isComposing) {
            inputSeenDuringComposition = true;
            pendingCommit = event.data;
            return;
          }

          if (pendingCommit !== null) {
            if (event.data === pendingCommit) {
              flushCommit(pendingCommit);
              return;
            }

            flushCommit(pendingCommit);
          }

          flushCommit(event.data);
          return;
        }
      }
    },
  };
}
