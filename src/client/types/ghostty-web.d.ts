declare module "ghostty-web" {
  export function init(): Promise<void>;

  export interface ITheme {
    foreground?: string;
    background?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    selectionForeground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  export interface ITerminalOptions {
    fontSize?: number;
    cols?: number;
    rows?: number;
    theme?: ITheme;
    scrollback?: number;
    fontFamily?: string;
    cursorBlink?: boolean;
    cursorStyle?: "block" | "underline" | "bar";
    disableStdin?: boolean;
  }

  export class Terminal {
    constructor(options?: ITerminalOptions);
    open(element: HTMLElement): void;
    write(data: string | Uint8Array): void;
    onData(listener: (data: string) => void): void;
    proposeDimensions?(): { cols: number; rows: number } | null;
    resize(cols: number, rows: number): void;
    dispose?(): void;
  }
}
