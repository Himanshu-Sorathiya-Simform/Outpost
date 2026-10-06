import { APP_ERROR_KINDS, type AppErrorKind } from '@/lib'
import { APP_SCENARIOS } from './ErrorsScenariosApp'
import { HTTP_SCENARIOS } from './ErrorsScenariosHttp'
import { SYNTHETIC_SCENARIOS } from './ErrorsScenariosSynthetic'
import type { Scenario } from './ErrorsScenarioTypes'

const BY_KIND = new Map<AppErrorKind, Scenario>([...HTTP_SCENARIOS, ...APP_SCENARIOS, ...SYNTHETIC_SCENARIOS].map((s) => [s.kind, s]))

/** One scenario per AppErrorKind, in the order the kinds are declared. A kind without a scenario is simply absent; the test file fails on it. */
export const SCENARIOS: Scenario[] = APP_ERROR_KINDS.flatMap((kind) => BY_KIND.get(kind) ?? [])
