/**
 * ルールの自己試遊（$game-playtest §2）。`scripts/playtest-rules.mjs` にコピーして、下の CHECKS をこのゲームに合わせて書き換える。
 *
 *   node scripts/playtest-rules.mjs            # src/rules.ts を回す
 *   node scripts/playtest-rules.mjs <path>      # 別のルールファイル
 *
 * rules.ts は描画・DOM・音・SDK に触れない純粋な関数だけにする:
 *   init(seed) → state / step(state, input, dt) → state
 *   アーケードは isOver(state) → boolean / score(state) → number も持つ。
 *   進行型はPROGRESSIONをtrueにしCHECKSを保存・クエストのrubricへ置換する。
 * 相対 import（./tuning など）は読める。パッケージの import は断る。
 * rollup と TypeScript の変換は SDK の build-config から借りる（Kit が版を固定。ゲームの package.json には書かない）。
 */
import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rollup, transpileTypeScript } from '@workspace/app-sdk/build-config'

const REQUIRED = ['init', 'step', 'isOver', 'score']
const PROGRESSION = false
const TS_EXTENSIONS = ['.ts', '.mts']

/** rules.ts（と相対 import 先）を JS にして読み込む。 */
export async function loadRules(entry, { progression = false } = {}) {
  const build = await rollup({
    input: resolvePath(entry),
    onwarn: () => {},
    plugins: [
      {
        name: 'rules-only',
        resolveId(source, importer) {
          if (!importer) return null
          if (!source.startsWith('.')) {
            throw new Error(
              `${source} は読み込めない。rules.ts は描画・SDK・パッケージに触れない純粋な関数だけにする`
            )
          }
          // ファイルのパスのまま解決する（URL の pathname は空白や日本語を %xx にして見つからなくなる）
          const base = resolvePath(dirname(importer), source)
          // TypeScript の ESM は './tuning.js' と書いて tuning.ts を指す
          const stem = base.endsWith('.js') ? base.slice(0, -'.js'.length) : base
          const candidates = TS_EXTENSIONS.some((extension) => base.endsWith(extension))
            ? [base]
            : [...TS_EXTENSIONS.map((extension) => `${stem}${extension}`), base]
          return candidates.find((candidate) => existsSync(candidate)) ?? null
        },
        transform(code, id) {
          if (!TS_EXTENSIONS.some((extension) => id.endsWith(extension))) return null
          return { code: transpileTypeScript(code, id), map: null }
        },
      },
    ],
  })
  try {
    const { output } = await build.generate({ format: 'es' })
    const source = Buffer.from(output[0].code).toString('base64')
    const rules = await import(`data:text/javascript;base64,${source}`)
    const required = progression ? ['init', 'step'] : REQUIRED
    const missing = required.filter((name) => typeof rules[name] !== 'function')
    if (missing.length > 0) {
      throw new Error(
        `rules.ts に ${missing.join(' / ')} が無い（${required.join(' / ')} を export する）`
      )
    }
    return rules
  } finally {
    await build.close()
  }
}

/** 数値が壊れていないか（NaN / Infinity）。壊れていればその場所を返す。 */
function brokenNumberIn(value, path = '') {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path || '(state)'
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const found = brokenNumberIn(child, path ? `${path}.${key}` : key)
      if (found) return found
    }
  }
  return null
}

/**
 * 決まった入力で遊ぶ。`input(t, state)` は経過秒と状態から、その瞬間の入力を返す。
 * 返り値: over（終わったか）/ endedAt（終わった秒）/ score / state / brokenNumber（壊れた数値の場所）/ samples（1 秒ごとの点数）
 */
export function simulate(rules, { seed = 1, seconds = 30, dt = 1 / 60, input = () => ({}) } = {}) {
  let state = rules.init(seed)
  const samples = []
  const steps = Math.round(seconds / dt)
  for (let index = 1; index <= steps; index += 1) {
    const t = index * dt
    state = rules.step(state, input(t, state), dt)
    const broken = brokenNumberIn(state)
    if (broken)
      return {
        over: false,
        endedAt: null,
        score: rules.score?.(state) ?? null,
        state,
        brokenNumber: broken,
        samples,
      }
    if (index % Math.round(1 / dt) === 0) samples.push(rules.score?.(state) ?? null)
    if (rules.isOver?.(state)) {
      return {
        over: true,
        endedAt: t,
        score: rules.score?.(state) ?? null,
        state,
        brokenNumber: null,
        samples,
      }
    }
  }
  return {
    over: false,
    endedAt: null,
    score: rules.score?.(state) ?? null,
    state,
    brokenNumber: null,
    samples,
  }
}

/** [名前, 関数] を順に回し、✓ / ✗ を出す。落ちた理由は関数が投げた Error の文。 */
export function runChecks(checks, print = console.log) {
  let ok = true
  for (const [name, check] of checks) {
    try {
      check()
      print(`✓ ${name}`)
    } catch (error) {
      ok = false
      print(`✗ ${name} — ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { ok }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------------------
// CHECKS: このゲームの rubric（design/playtest.md）に合わせて書き換える。
// 入力（idle / play）の形は rules.ts の Input に合わせる。
// ---------------------------------------------------------------------------

/** 何も押さない */
const idle = () => ({})
/** うまく遊ぶ人の入力（このゲームの操作に書き換える） */
const play = (t) => ({ right: Math.floor(t * 2) % 2 === 0 })

function checksFor(rules) {
  return [
    ['開始できる', () => expect(rules.init(1) != null, 'init が状態を返さない')],
    [
      '何もしなくても最初の 10 秒は終わらない',
      () => {
        const run = simulate(rules, { seconds: 10, input: idle })
        expect(!run.over, `${run.endedAt?.toFixed(1)} 秒で終わった（最初は失敗しにくくする）`)
      },
    ],
    [
      'いつかは終わる（負けか時間切れが起きる）',
      () => expect(simulate(rules, { seconds: 300, input: idle }).over, '5 分放置しても終わらない'),
    ],
    [
      '遊ぶと点が増える',
      () => {
        const run = simulate(rules, { seconds: 20, input: play })
        expect(run.score > 0, '20 秒遊んでも点が 0')
      },
    ],
    [
      '数値が壊れない',
      () => {
        for (const input of [idle, play]) {
          const run = simulate(rules, { seconds: 60, input })
          expect(!run.brokenNumber, `${run.brokenNumber} が NaN か Infinity になった`)
        }
      },
    ],
    [
      '再挑戦で最初の状態に戻る',
      () => {
        const first = JSON.stringify(rules.init(1))
        simulate(rules, { seconds: 20, input: play })
        const again = JSON.stringify(rules.init(1))
        expect(
          first === again,
          '遊んだあとの init が最初と違う（Math.random を使っていないか・状態を使い回していないか）'
        )
      },
    ],
  ]
}

async function main() {
  const entry = process.argv[2] ?? 'src/rules.ts'
  const rules = await loadRules(entry, { progression: PROGRESSION })
  const { ok } = runChecks(checksFor(rules))
  process.exitCode = ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  await main()
}
