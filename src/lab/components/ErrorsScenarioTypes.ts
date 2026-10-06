import type { AppError, AppErrorKind } from '@/lib'

/** What a scenario may ask of the page that hosts it. */
export interface ScenarioContext {
  /** Arms the render box so its child throws on the next render. */
  crash(): void
}

/**
 * What a run produced besides a thrown error.
 * `error` + `file`: the scenario built an AppError by hand, and the simulator files it in the centre
 * (real failures reach the centre through the app's own layers instead).
 */
export interface Outcome {
  error?: AppError
  file?: boolean
  note?: string
}

export interface ScenarioConfirm {
  title: string
  body: string
  label: string
}

export interface ScenarioAction {
  id: string
  label: string
  run(ctx: ScenarioContext): Promise<Outcome | void>
  confirm?: ScenarioConfirm
  /** Stays clickable while another scenario runs (an Undo must never be locked out). */
  always?: boolean
}

export interface Scenario {
  kind: AppErrorKind
  /** REAL: provoked by a genuine mechanism. SYNTHETIC: constructed. */
  real: boolean
  /** One or two sentences: the mechanism, in plain words. */
  how: string
  /** A side effect worth reading before pressing. */
  caution?: string
  /** Why nothing is expected in the centre, when that is the correct outcome. */
  quietReason?: string
  actions: ScenarioAction[]
}

/** A row the centre received during a run. */
export interface Landed {
  id: string
  kind: AppErrorKind
  source: string | null
  count: number
  userMessage: string
}

export interface RunResult {
  at: number
  /** The error the caller saw (thrown, or built by the scenario). Null when the run resolved. */
  caught: AppErrorKind | null
  note: string | null
  landed: Landed[]
}
