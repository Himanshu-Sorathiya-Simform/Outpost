/**
 * Reached only from Lab, Errors. It throws while rendering, on purpose: the route's errorElement has to catch it.
 * Nothing else imports this file.
 */
export default function CrashRoute(): never {
  throw new Error('Deliberate render crash from /lab/errors/route-crash. The route errorElement should catch this.')
}
