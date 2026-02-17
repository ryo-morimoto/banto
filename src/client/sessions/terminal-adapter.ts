export interface TerminalAdapter {
  open(element: HTMLElement): void;
  write(data: string | Uint8Array): void;
  onData(listener: (data: string) => void): () => void;
  proposeDimensions(): { cols: number; rows: number } | null;
  resize(cols: number, rows: number): void;
  dispose(): void;
}
