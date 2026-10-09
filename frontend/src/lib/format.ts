import { pad } from "@/model";

export function clockAt(clock0: number, seconds: number): string {
  const total = clock0 + seconds;
  return `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function duration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${pad(seconds % 60)}s`;
  }
  return `${Math.floor(seconds / 3600)}h ${pad(Math.floor(seconds / 60) % 60)}m`;
}

export function elapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60) % 60;
  if (total < 3600) {
    return `+${minutes}:${pad(total % 60)}`;
  }
  return `+${Math.floor(total / 3600)}:${pad(minutes)}:${pad(total % 60)}`;
}

export function tokens(count: number): string {
  if (count < 1000) {
    return String(count);
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  }
  return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 2 : 1)}M`;
}
