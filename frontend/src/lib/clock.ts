export type Clock = { clockMs: number; tick: number };

export type ShellEnvironment = Clock & { narrow: boolean };
