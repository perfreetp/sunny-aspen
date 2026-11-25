import { clamp } from './schema.js'

const RUNWAY_END = 155

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 纯数据、固定步长的飞行动作器。
 * 不接触 Three/DOM；同一 profile 的初始状态和逐步 dt 完全确定。
 */
export class FlightDirector {
  constructor() {
    this.profile = 'takeoff'
    this.time = 0
    this.events = []
    this.state = this.initialState('takeoff')
  }

  initialState(profile) {
    const common = {
      time: 0,
      x: 0,
      y: 0,
      z: -105,
      vx: 0,
      vy: 0,
      vz: 0,
      throttle: 0,
      airspeed: 0,
      altitude: 0,
      pitch: 0,
      roll: 0,
      heading: 0,
      gearDown: true,
      weightOnWheels: true,
      phase: 'stopped'
    }

    if (profile === 'landing' || profile === 'touch_go') {
      return {
        ...common,
        z: -128,
        y: 27,
        altitude: 27,
        airspeed: 31,
        throttle: 0.34,
        weightOnWheels: false,
        phase: 'approach'
      }
    }

    return { ...common, phase: 'lineup' }
  }

  replay(profile = this.profile) {
    this.profile = profile
    this.time = 0
    this.events.length = 0
    this.state = this.initialState(profile)
    return this.state
  }

  /**
   * @returns {Array<{type:string, intensity?:number}>}
   */
  step(dt, params) {
    this.events.length = 0
    this.time += dt
    const s = this.state
    const prevWow = s.weightOnWheels
    const prevGear = s.gearDown

    if (params.controlMode === 'manual') {
      this.stepManual(dt, params)
    } else if (this.profile === 'landing') {
      this.stepLanding(dt)
    } else if (this.profile === 'touch_go') {
      this.stepTouchGo(dt)
    } else {
      this.stepTakeoff(dt, params)
    }

    s.time = this.time
    s.altitude = Math.max(0, s.y)
    s.vz = s.airspeed
    s.vy = Number.isFinite(s.vy) ? s.vy : 0

    if (!prevWow && s.weightOnWheels) {
      this.events.push({ type: 'touchdown', intensity: clamp(s.airspeed / 42, 0.45, 1.25) })
    }
    if (prevWow && !s.weightOnWheels) {
      this.events.push({ type: 'liftoff', intensity: clamp(s.airspeed / 42, 0.4, 1) })
    }
    if (prevGear !== s.gearDown) {
      this.events.push({ type: 'gear_changed', gearDown: s.gearDown })
    }

    return this.events
  }

  stepManual(dt, params) {
    const f = params.flight
    const s = this.state
    s.throttle = clamp(f.throttle, 0, 1)
    s.airspeed = Math.max(0, f.airspeed)
    s.gearDown = !!f.gearDown
    s.weightOnWheels = !!f.weightOnWheels
    s.heading = f.headingDeg || 0
    s.pitch = s.weightOnWheels ? 0 : 0.08

    if (s.weightOnWheels) {
      s.y = 0
      s.vy = 0
    } else {
      s.y = Math.max(0, f.altitude)
      s.vy = 0
    }

    s.z += s.airspeed * dt
    if (s.z > RUNWAY_END + 35) {
      s.z = -RUNWAY_END - 20
      s.x = 0
    }
    s.phase = 'manual'
  }

  stepTakeoff(dt, params) {
    const s = this.state
    const t = this.time
    const thrustScale = clamp(params.flight.ratedThrustKn / 160, 0.72, 1.35)

    if (t < 1.1) {
      s.phase = 'lineup'
      s.throttle = lerp(s.throttle, 0.72, 0.2)
      s.airspeed = 0
    } else if (t < 7.7) {
      s.phase = 'ground-roll'
      s.throttle = lerp(s.throttle, 0.98, 0.12)
      const drag = 0.0011 * s.airspeed * s.airspeed
      const accel = 6.1 * s.throttle * thrustScale - 0.34 - drag
      s.airspeed = Math.max(0, s.airspeed + accel * dt)
      s.pitch = lerp(s.pitch, t > 6.6 ? 0.2 : 0, 0.12)
      s.weightOnWheels = true
      s.y = 0
    } else if (t < 9.2) {
      s.phase = 'rotation'
      s.throttle = 1
      const drag = 0.001 * s.airspeed * s.airspeed
      s.airspeed += (5.4 * thrustScale - drag) * dt
      s.pitch = lerp(s.pitch, 0.23, 0.16)
      s.weightOnWheels = t < 8.75
      if (!s.weightOnWheels) s.y += 5.2 * dt
    } else {
      s.phase = 'initial-climb'
      s.throttle = lerp(s.throttle, 0.94, 0.04)
      s.airspeed = lerp(s.airspeed, 46, 0.025)
      s.pitch = lerp(s.pitch, 0.17, 0.08)
      s.weightOnWheels = false
      s.vy = lerp(s.vy, 8.2, 0.05)
      s.y += s.vy * dt
      if (t > 11.6) s.gearDown = false
    }

    s.z += s.airspeed * dt
  }

  stepLanding(dt) {
    const s = this.state
    const t = this.time

    if (t < 5.15) {
      s.phase = 'approach'
      s.gearDown = true
      s.weightOnWheels = false
      s.throttle = lerp(s.throttle, 0.34, 0.08)
      s.airspeed = lerp(s.airspeed, 31.5, 0.04)
      const glideTargetY = Math.max(0, 27 - (t / 5.15) * 27)
      s.y = lerp(s.y, glideTargetY, 0.18)
      s.vy = -4.6
      s.pitch = lerp(s.pitch, -0.035, 0.08)
    } else if (t < 6.0) {
      s.phase = 'flare'
      s.throttle = lerp(s.throttle, 0.18, 0.12)
      s.airspeed = lerp(s.airspeed, 29, 0.05)
      s.pitch = lerp(s.pitch, 0.1, 0.14)
      s.y = Math.max(0, s.y - 1.1 * dt)
      s.vy = -1.1
      if (s.y <= 0.03) {
        s.y = 0
        s.weightOnWheels = true
      }
    } else {
      s.phase = 'rollout'
      s.weightOnWheels = true
      s.gearDown = true
      s.y = 0
      s.throttle = lerp(s.throttle, 0.04, 0.12)
      const braking = t < 11.5 ? 4.4 : 2.2
      s.airspeed = Math.max(0, s.airspeed - braking * dt - 0.0009 * s.airspeed * s.airspeed * dt)
      s.pitch = lerp(s.pitch, 0, 0.12)
    }

    s.z += s.airspeed * dt
  }

  stepTouchGo(dt) {
    const s = this.state
    const t = this.time

    if (t < 5.15) {
      this.stepLandingApproachCommon(t, dt)
    } else if (t < 5.9) {
      s.phase = 'touchdown'
      s.throttle = 0.2
      s.airspeed = lerp(s.airspeed, 29, 0.06)
      s.pitch = lerp(s.pitch, 0.08, 0.14)
      s.y = 0
      s.weightOnWheels = true
    } else if (t < 8.4) {
      s.phase = 'touch-go-roll'
      s.weightOnWheels = true
      s.gearDown = true
      s.y = 0
      s.throttle = lerp(s.throttle, 1, 0.18)
      s.airspeed += (5.8 * s.throttle - 0.5 - 0.001 * s.airspeed ** 2) * dt
      s.pitch = lerp(s.pitch, t > 7.5 ? 0.2 : 0, 0.12)
    } else {
      s.phase = 'touch-go-climb'
      s.throttle = 0.98
      s.weightOnWheels = t < 8.9
      if (!s.weightOnWheels) {
        s.vy = lerp(s.vy, 7.5, 0.08)
        s.y += s.vy * dt
      }
      s.pitch = lerp(s.pitch, 0.18, 0.1)
      if (t > 10.8) s.gearDown = false
      s.airspeed = lerp(s.airspeed, 43, 0.03)
    }

    s.z += s.airspeed * dt
  }

  stepLandingApproachCommon(t, dt) {
    const s = this.state
    s.phase = 'approach'
    s.gearDown = true
    s.weightOnWheels = false
    s.throttle = lerp(s.throttle, 0.34, 0.08)
    s.airspeed = lerp(s.airspeed, 31.5, 0.04)
    s.y = Math.max(0, 27 - smoothstep(0, 5.15, t) * 27)
    s.vy = -4.6
    s.pitch = -0.035
  }
}
