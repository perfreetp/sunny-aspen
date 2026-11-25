import type { DeviceParams, PauseSegment, SpeedPoint, TrackNode } from '../types';

export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const roundTo = (v: number, step = 0.1): number => Math.round(v / step) * step;

export function sortedSpeedPoints(points: SpeedPoint[]): SpeedPoint[] {
  return [...points].sort((a, b) => a.x - b.x);
}

function rawWeightAt(points: SpeedPoint[], x: number): number {
  if (points.length === 0) return 1;
  const sorted = sortedSpeedPoints(points);
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return lerp(a.y, b.y, t);
    }
  }
  return 1;
}

export interface SpeedProfile {
  /** 进度 p -> 归一化后的速度倍率 */
  speedAtProgress: (p: number) => number;
  /** 进度 p -> 归一化运动时间 0..1 */
  timeAtProgress: (p: number) => number;
  /** 归一化运动时间 u -> 展开进度 */
  progressAtTime: (u: number) => number;
}

/**
 * 曲线横轴是展开进度，纵轴是速度倍率。
 * 对 1/y 积分并归一，使 ∫dp/yNorm = 1，因此拖动曲线只改变快慢分布，
 * 不改变已经排好的总展开时长。
 */
export function createSpeedProfile(points: SpeedPoint[], samples = 240): SpeedProfile {
  const ys: number[] = [];
  const cumulative: number[] = [0];
  let invIntegral = 0;
  for (let i = 0; i <= samples; i += 1) {
    const p = i / samples;
    const y = Math.max(0.18, rawWeightAt(points, p));
    ys.push(y);
    if (i > 0) {
      const p0 = (i - 1) / samples;
      const y0 = ys[i - 1];
      const y1 = y;
      invIntegral += 0.5 * (1 / y0 + 1 / y1) * (p - p0);
      cumulative.push(invIntegral);
    }
  }
  const scale = invIntegral > 0 ? invIntegral : 1; // yNorm = scale * yRaw

  const timeAtProgress = (p: number): number => {
    const x = clamp(p);
    const f = x * samples;
    const i = Math.min(samples - 1, Math.floor(f));
    const t = f - i;
    const raw = lerp(cumulative[i], cumulative[i + 1], t);
    return clamp(raw / scale);
  };

  const progressAtTime = (u: number): number => {
    const target = clamp(u) * scale;
    let lo = 0;
    let hi = samples;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const c0 = cumulative[i - 1];
    const c1 = cumulative[i];
    const t = c1 === c0 ? 0 : (target - c0) / (c1 - c0);
    return clamp(((i - 1) + t) / samples);
  };

  return {
    speedAtProgress: (p: number) => Math.max(0.05, rawWeightAt(points, clamp(p)) * scale),
    timeAtProgress,
    progressAtTime,
  };
}

export function sortedPauses(track: TrackNode): PauseSegment[] {
  return [...track.pauses].sort((a, b) => a.at - b.at);
}

export interface RelativePause extends PauseSegment {
  /** 相对轨道触发点的秒数 */
  startRel: number;
  endRel: number;
}

export function getRelativePauses(track: TrackNode): RelativePause[] {
  const profile = createSpeedProfile(track.speedPoints);
  let priorPauseTime = 0;
  return sortedPauses(track).map((pause) => {
    const reach = profile.timeAtProgress(pause.at) * track.openDuration;
    const startRel = track.device.startDelayS + reach + priorPauseTime;
    const endRel = startRel + pause.duration;
    priorPauseTime += pause.duration;
    return { ...pause, startRel, endRel };
  });
}

export function totalPauseDuration(track: TrackNode): number {
  return track.pauses.reduce((sum, p) => sum + p.duration, 0);
}

export function openEndRelative(track: TrackNode): number {
  return track.device.startDelayS + track.openDuration + totalPauseDuration(track);
}

export function trackTotalDuration(track: TrackNode): number {
  return openEndRelative(track) + track.holdDuration + track.closeDuration;
}

export function trackInterval(track: TrackNode): { start: number; end: number } {
  return { start: track.start, end: track.start + trackTotalDuration(track) };
}

export type TrackPhase = 'idle' | 'delay' | 'open' | 'pause' | 'hold' | 'close' | 'done';

export interface TrackSample {
  progress: number;
  phase: TrackPhase;
  activePauseId?: string;
  /** 当前物理速度，米/秒 */
  physicalSpeed: number;
  normalizedMotionTime: number;
}

export function sampleTrack(track: TrackNode, time: number): TrackSample {
  const profile = createSpeedProfile(track.speedPoints);
  const local = time - track.start;
  const delay = track.device.startDelayS;
  const totalPause = totalPauseDuration(track);
  const idle: TrackSample = { progress: 0, phase: local < 0 ? 'idle' : 'done', physicalSpeed: 0, normalizedMotionTime: 0 };
  if (local < 0) return idle;
  if (local < delay) return { progress: 0, phase: 'delay', physicalSpeed: 0, normalizedMotionTime: 0 };

  const relativePauses = getRelativePauses(track);
  let priorPause = 0;

  for (const pause of relativePauses) {
    if (local < pause.startRel) {
      const motionElapsed = Math.max(0, local - delay - priorPause);
      const u = clamp(motionElapsed / Math.max(0.001, track.openDuration));
      const progress = profile.progressAtTime(u);
      return {
        progress,
        phase: 'open',
        physicalSpeed: (track.device.strokeMm / 1000 / Math.max(0.1, track.openDuration)) * profile.speedAtProgress(progress),
        normalizedMotionTime: u,
      };
    }
    if (local < pause.endRel) {
      return { progress: pause.at, phase: 'pause', activePauseId: pause.id, physicalSpeed: 0, normalizedMotionTime: profile.timeAtProgress(pause.at) };
    }
    priorPause += pause.duration;
  }

  const openEnd = openEndRelative(track);
  if (local < openEnd) {
    const motionElapsed = Math.max(0, local - delay - totalPause);
    const u = clamp(motionElapsed / Math.max(0.001, track.openDuration));
    const progress = profile.progressAtTime(u);
    return {
      progress,
      phase: 'open',
      physicalSpeed: (track.device.strokeMm / 1000 / Math.max(0.1, track.openDuration)) * profile.speedAtProgress(progress),
      normalizedMotionTime: u,
    };
  }

  const holdEnd = openEnd + track.holdDuration;
  if (local < holdEnd) return { progress: 1, phase: 'hold', physicalSpeed: 0, normalizedMotionTime: 1 };

  const closeEnd = holdEnd + track.closeDuration;
  if (local < closeEnd) {
    const u = clamp((local - holdEnd) / Math.max(0.001, track.closeDuration));
    const progress = 1 - profile.progressAtTime(u);
    return {
      progress,
      phase: 'close',
      physicalSpeed: -(track.device.strokeMm / 1000 / Math.max(0.1, track.closeDuration)) * profile.speedAtProgress(clamp(progress)),
      normalizedMotionTime: u,
    };
  }
  return { ...idle, phase: 'done' };
}

export interface KeyframeInfo {
  id: string;
  time: number;
  kind: 'trigger' | 'motion-start' | 'pause-start' | 'pause-end' | 'open-end' | 'hold-end' | 'close-end';
  label: string;
  pauseId?: string;
}

export function getKeyframes(track: TrackNode): KeyframeInfo[] {
  const frames: KeyframeInfo[] = [
    { id: `${track.id}-trigger`, time: track.start, kind: 'trigger', label: '触发' },
    { id: `${track.id}-motion-start`, time: track.start + track.device.startDelayS, kind: 'motion-start', label: '起步' },
  ];
  for (const p of getRelativePauses(track)) {
    frames.push({ id: `${p.id}-start`, time: track.start + p.startRel, kind: 'pause-start', label: '停顿开始', pauseId: p.id });
    frames.push({ id: `${p.id}-end`, time: track.start + p.endRel, kind: 'pause-end', label: '继续', pauseId: p.id });
  }
  frames.push({ id: `${track.id}-open-end`, time: track.start + openEndRelative(track), kind: 'open-end', label: '展开到位' });
  frames.push({ id: `${track.id}-hold-end`, time: track.start + openEndRelative(track) + track.holdDuration, kind: 'hold-end', label: '保持结束' });
  frames.push({ id: `${track.id}-close-end`, time: track.start + trackTotalDuration(track), kind: 'close-end', label: '收拢到位' });
  return frames.sort((a, b) => a.time - b.time);
}

/** 梯形速度节奏下的机械运行时间估算。 */
export function mechanicalOpenDuration(device: DeviceParams): number {
  const stroke = device.strokeMm / 1000;
  const v = Math.max(0.01, device.speedMps);
  const rampDistance = 0.5 * v * (device.rampUpS + device.rampDownS);
  if (stroke <= rampDistance * 2) {
    return Math.sqrt((4 * stroke * (device.rampUpS + device.rampDownS)) / (2 * v || 1));
  }
  return stroke / v + (device.rampUpS + device.rampDownS) / 2;
}

export function formatTime(t: number): string {
  if (!Number.isFinite(t)) return '0.0s';
  return `${t.toFixed(1)}s`;
}

export function formatClock(t: number): string {
  const sign = t < 0 ? '-' : '';
  const v = Math.abs(t);
  const m = Math.floor(v / 60);
  const s = (v % 60).toFixed(1).padStart(4, '0');
  return `${sign}${m}:${s.padStart(4, '0')}`;
}
