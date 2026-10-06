/**
 * Ships "a new deploy" so an update can be practised: bumps the patch version in package.json (and the root entries of
 * package-lock.json), then runs the production build, which stamps a fresh BUILD_ID into dist/version.json.
 *
 *   npm run release            patch bump, 1.0.0 -> 1.0.1
 *   npm run release -- minor   minor bump, 1.0.1 -> 1.1.0
 *   npm run release -- major   major bump, 1.1.0 -> 2.0.0
 *
 * The running API keeps answering with the version it started with; the page-side deploy watcher reads
 * dist/version.json, so a tab that is already open sees a newer build than the one it is running.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const KINDS = ['patch', 'minor', 'major']
const kind = process.argv[2] ?? 'patch'
if (!KINDS.includes(kind)) {
  console.error(`Unknown bump "${kind}". Use one of: ${KINDS.join(', ')}.`)
  process.exit(1)
}

const root = new URL('../', import.meta.url)
const file = (name) => new URL(name, root)

function bump(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`package.json version "${version}" is not plain major.minor.patch`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

async function readJson(name) {
  return JSON.parse(await readFile(file(name), 'utf8'))
}

async function writeJson(name, value) {
  await writeFile(file(name), `${JSON.stringify(value, null, 2)}\n`)
}

const pkg = await readJson('package.json')
const from = pkg.version
const to = bump(from)
pkg.version = to
await writeJson('package.json', pkg)

const lock = await readJson('package-lock.json').catch(() => null)
if (lock) {
  lock.version = to
  if (lock.packages?.['']) lock.packages[''].version = to
  await writeJson('package-lock.json', lock)
}

console.log(`Version ${from} -> ${to}. Building.`)
const build = spawnSync('npm', ['run', 'build'], { cwd: fileURLToPath(root), stdio: 'inherit' })
if (build.status !== 0) {
  console.error('Build failed. package.json keeps the new version; fix the error and run "npm run build".')
  process.exit(build.status ?? 1)
}
console.log(`Done. dist/version.json now carries ${to}. Reload one tab and leave another open to see the two builds side by side.`)
