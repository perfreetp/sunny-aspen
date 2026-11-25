export type ToothProfileId = 'involute' | 'trapezoidal' | 'arc';

export interface Point2 {
  x: number;
  y: number;
}

export interface GearContourInput {
  teeth: number;
  module: number;
  pressureAngleDeg: number;
  profile: ToothProfileId;
}

const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function polar(radius: number, angle: number): Point2 {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Builds a closed, counter-clockwise 2D tooth outline.
 * The outline is intentionally a manufacturing-style approximation:
 * module and pressure angle drive pitch/root/tip dimensions, while the
 * profile selector changes flank and addendum shape.
 */
export function buildGearContour(input: GearContourInput): Point2[] {
  const z = Math.round(input.teeth);
  const m = input.module;
  const alpha = (input.pressureAngleDeg * Math.PI) / 180;

  const pitchRadius = (m * z) / 2;
  const baseRadius = pitchRadius * Math.cos(alpha);
  const tipRadius = pitchRadius + m;
  const rootRadius = Math.max(m * 1.6, pitchRadius - 1.25 * m);

  const pitch = TAU / z;
  const pitchHalfPhysical = (Math.PI * m) / 4;
  const rootHalfPhysical = pitchHalfPhysical + 1.25 * m * Math.tan(alpha);
  const tipHalfPhysical = Math.max(m * 0.32, pitchHalfPhysical - m * Math.tan(alpha) * 0.82);
  const involuteAtPitch = Math.tan(alpha) - alpha;
  const pitchHalfAngle = Math.PI / (2 * z);

  const halfAngleAtRadius = (radius: number): number => {
    const t = clamp((radius - rootRadius) / Math.max(0.001, tipRadius - rootRadius), 0, 1);

    if (input.profile === 'involute') {
      if (radius <= baseRadius) {
        return pitchHalfAngle + involuteAtPitch;
      }
      const localPressure = Math.acos(clamp(baseRadius / radius, -1, 1));
      const involuteHere = Math.tan(localPressure) - localPressure;
      return Math.max(pitch * 0.08, pitchHalfAngle + involuteAtPitch - involuteHere);
    }

    if (input.profile === 'arc') {
      const q = smoothstep(t);
      const physical =
        rootHalfPhysical +
        (tipHalfPhysical - rootHalfPhysical) * q +
        m * 0.16 * Math.sin(Math.PI * t);
      return physical / radius;
    }

    const physical = rootHalfPhysical + (tipHalfPhysical - rootHalfPhysical) * t;
    return physical / radius;
  };

  const rootHalf = halfAngleAtRadius(rootRadius);
  const tipHalf = halfAngleAtRadius(tipRadius);
  const points: Point2[] = [polar(rootRadius, -rootHalf)];

  const flankSteps = input.profile === 'trapezoidal' ? 2 : 7;
  const gapSteps = 4;
  const tipSteps = input.profile === 'arc' ? 7 : 4;

  for (let tooth = 0; tooth < z; tooth += 1) {
    const center = tooth * pitch;

    // Left flank: root point already exists.
    for (let step = 1; step <= flankSteps; step += 1) {
      const t = step / flankSteps;
      const radius = rootRadius + (tipRadius - rootRadius) * t;
      points.push(polar(radius, center - halfAngleAtRadius(radius)));
    }

    // Addendum / tip.
    for (let step = 1; step <= tipSteps; step += 1) {
      const u = step / tipSteps;
      const angle = center - tipHalf + 2 * tipHalf * u;
      let radius = tipRadius;
      if (input.profile === 'arc') {
        radius += m * 0.22 * Math.sin(Math.PI * u);
      }
      points.push(polar(radius, angle));
    }

    // Right flank, excluding the already-added right tip.
    for (let step = flankSteps - 1; step >= 0; step -= 1) {
      const t = step / flankSteps;
      const radius = rootRadius + (tipRadius - rootRadius) * t;
      points.push(polar(radius, center + halfAngleAtRadius(radius)));
    }

    // Root land and gap arc leading to the next tooth.
    const nextCenter = center + pitch;
    const gapStart = center + rootHalf;
    const gapEnd = nextCenter - rootHalf;
    const lastGapStep = tooth === z - 1 ? gapSteps - 1 : gapSteps;

    for (let step = 1; step <= lastGapStep; step += 1) {
      const u = step / gapSteps;
      const angle = gapStart + (gapEnd - gapStart) * u;
      points.push(polar(rootRadius, angle));
    }
  }

  return points;
}

export function buildRackContour(length: number, module: number): Point2[] {
  const pitch = Math.PI * module;
  const toothCount = Math.max(8, Math.round(length / pitch));
  const actualLength = toothCount * pitch;
  const x0 = -actualLength / 2;
  const yTip = module;
  const yRoot = -1.25 * module;
  const bodyHeight = Math.max(12, module * 5.2);
  const yBottom = yRoot - bodyHeight;
  const halfTooth = pitch * 0.23;

  const top: Point2[] = [{ x: x0, y: yRoot }];

  for (let i = 0; i < toothCount; i += 1) {
    const center = x0 + (i + 0.5) * pitch;
    top.push({ x: center - halfTooth * 1.35, y: yRoot });
    top.push({ x: center - halfTooth, y: yTip });
    top.push({ x: center + halfTooth, y: yTip });
    top.push({ x: center + halfTooth * 1.35, y: yRoot });
  }

  top.push({ x: actualLength / 2, y: yRoot });

  // Bottom edge first, then top edge in reverse for CCW winding.
  return [
    { x: x0, y: yBottom },
    { x: actualLength / 2, y: yBottom },
    ...top.reverse(),
  ];
}

export function circlePoints(
  cx: number,
  cy: number,
  radius: number,
  segments = 28,
  clockwise = false,
): Point2[] {
  const points: Point2[] = [];
  const direction = clockwise ? -1 : 1;
  for (let i = 0; i < segments; i += 1) {
    const angle = direction * (i / segments) * TAU;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}
