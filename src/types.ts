export type ID = string;

export interface SpeedPoint {
  id: ID;
  /** 0..1，帘布展开进度 */
  x: number;
  /** 原始速度倍率，编辑器会保持曲线积分对应的总时长 */
  y: number;
}

export interface PauseSegment {
  id: ID;
  /** 0..1，在该展开进度处停顿 */
  at: number;
  /** 停顿秒数 */
  duration: number;
  label?: string;
}

export interface DeviceParams {
  model: string;
  motorModel: string;
  voltageV: number;
  powerKw: number;
  /** 电机/轨道额定行程，毫米 */
  strokeMm: number;
  /** 额定线速度，米/秒 */
  speedMps: number;
  /** 起步缓升，秒 */
  rampUpS: number;
  /** 到位缓停，秒 */
  rampDownS: number;
  /** 组触发后的电机启动延时，秒 */
  startDelayS: number;
  /** 每小时允许启停次数，作为启停节奏校验参数 */
  maxStartsPerHour: number;
}

export interface TrackNode {
  kind: 'track';
  id: ID;
  name: string;
  code: string;
  color: string;
  z: number;
  fabricWidth: number;
  visible: boolean;
  locked: boolean;
  /** 弧长参数 0..1：收拢端 */
  endpointA: number;
  /** 弧长参数 0..1：展开端 */
  endpointB: number;
  start: number;
  /** 纯展开运动时长，不含中途停顿 */
  openDuration: number;
  holdDuration: number;
  closeDuration: number;
  speedPoints: SpeedPoint[];
  pauses: PauseSegment[];
  device: DeviceParams;
}

export interface GroupNode {
  kind: 'group';
  id: ID;
  name: string;
  color: string;
  collapsed: boolean;
  children: ID[];
}

export type TimelineNode = TrackNode | GroupNode;

export interface PlanMeta {
  projectName: string;
  planCode: string;
  greenhouseModel: string;
  importedAt: string;
  source: string;
}

export interface ProjectState {
  meta: PlanMeta;
  nodes: Record<ID, TimelineNode>;
  rootIds: ID[];
}

export interface PlaybackRange {
  start: number;
  end: number;
  groupId?: ID;
}

export interface Notice {
  id: number;
  tone: 'ok' | 'warn' | 'info';
  text: string;
}
