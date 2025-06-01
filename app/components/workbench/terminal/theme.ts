import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--dev-agents-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--dev-agents-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--dev-agents-elements-terminal-textColor'),
    background: cssVar('--dev-agents-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--dev-agents-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--dev-agents-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--dev-agents-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--dev-agents-elements-terminal-color-black'),
    red: cssVar('--dev-agents-elements-terminal-color-red'),
    green: cssVar('--dev-agents-elements-terminal-color-green'),
    yellow: cssVar('--dev-agents-elements-terminal-color-yellow'),
    blue: cssVar('--dev-agents-elements-terminal-color-blue'),
    magenta: cssVar('--dev-agents-elements-terminal-color-magenta'),
    cyan: cssVar('--dev-agents-elements-terminal-color-cyan'),
    white: cssVar('--dev-agents-elements-terminal-color-white'),
    brightBlack: cssVar('--dev-agents-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--dev-agents-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--dev-agents-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--dev-agents-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--dev-agents-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--dev-agents-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--dev-agents-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--dev-agents-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
