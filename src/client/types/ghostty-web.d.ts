declare module "@nicolo-ribaudo/ghostty-web" {
  export function init(): Promise<void>;

  export class Terminal {
    constructor(options: { fontSize: number; cols: number; rows: number });
    open(element: HTMLElement): void;
    write(data: string | Uint8Array): void;
    onData(listener: (data: string) => void): void;
    proposeDimensions?(): { cols: number; rows: number } | null;
    resize(cols: number, rows: number): void;
    dispose?(): void;
  }
}
