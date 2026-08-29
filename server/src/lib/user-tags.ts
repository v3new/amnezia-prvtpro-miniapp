/**
 * Per-user overrides carried in the panel's free-text user `description`.
 *
 * The panel has no per-user connection quota of its own, but every user
 * already carries an admin-editable `description` that round-trips through
 * `GET /api/users` and `POST /api/users/{id}/update`. Tagging that field keeps
 * this app stateless — no second store to deploy, back up, or let drift out of
 * sync with the panel — and leaves the admin editing users where they already
 * do.
 *
 * Format is `#key=value`, anywhere in the description, whitespace separated.
 * Anything that does not match stays human prose:
 *
 *     Вася, друг с работы. Платит вперёд. #slots=12
 *
 * Worth knowing before extending this: the panel renders the description into
 * a single-quoted HTML attribute and into raw HTML (templates/users.html), so
 * `" ' < > \` and newlines *anywhere* in the field break the panel's own edit
 * button. The tag syntax deliberately stays inside that safe subset.
 */

/**
 * Deliberately loose — it matches anything shaped like a tag and leaves typing
 * to the resolvers below. A strict lexer would make `#slots=много` vanish, and
 * "no tag" would become indistinguishable from "tag with a typo"; the second
 * has to reach the log or a silent typo is unfindable.
 */
const TAG_RE = /#([A-Za-z][A-Za-z0-9_]*(?::[A-Za-z][A-Za-z0-9_]*)?)=(\S+)/g

/** People end sentences: `лимит поднят #slots=12.` means 12, not a typo. */
const TRAILING_PUNCT = /[.,;:!?)]+$/

export interface UserTag {
  key: string
  value: string
}

/** Tag owner, for logs that let an admin find the description they fat-fingered. */
export interface TaggedUser {
  username: string
  description?: string | null
}

/**
 * Every `#key=value` in the description, in written order, keys lowercased.
 *
 * Unknown keys are returned rather than dropped, and every consumer ignores the
 * ones it does not own. That is what lets a tag be written into descriptions
 * before the release that understands it ships — and lets an older instance
 * survive a tag from a newer one.
 */
export function lexTags(description: string | null | undefined): UserTag[] {
  if (!description) return []
  return [...description.matchAll(TAG_RE)].map((m) => ({
    key: (m[1] as string).toLowerCase(),
    value: (m[2] as string).replace(TRAILING_PUNCT, ''),
  }))
}

export const SLOTS_TAG = 'slots'

/**
 * Ceiling on `#slots`. Each slot is a real WireGuard peer in the server config,
 * so an admin fat-fingering `#slots=999` must not be able to mint 999 of them.
 */
export const SLOTS_MAX = 20

/**
 * Resolve how many connections this user may hold: `#slots=N` when present and
 * sane, otherwise the global default.
 *
 * Two rules, asymmetric on purpose:
 *   - a malformed value never lands *below* the default — a typo must not cost
 *     someone access they already had;
 *   - an oversized value is clamped rather than rejected — the admin's intent
 *     to grant more is honoured, just bounded.
 *
 * `#slots=0` is valid and deliberate: it freezes new connections while leaving
 * the existing ones working, which no other switch in the panel expresses.
 */
export function resolveConnectionLimit(user: TaggedUser, fallback: number): number {
  let limit = fallback
  for (const {key, value} of lexTags(user.description)) {
    if (key !== SLOTS_TAG) continue
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) {
      console.warn(`[user-tags] ${user.username}: #${SLOTS_TAG}=${value} is not a whole number ≥ 0, using ${fallback}`)
      continue
    }
    if (parsed > SLOTS_MAX) {
      console.warn(`[user-tags] ${user.username}: #${SLOTS_TAG}=${parsed} exceeds ${SLOTS_MAX}, clamped`)
    }
    // Last one wins: people append to the end of a text field rather than
    // editing the middle, so the trailing value is the most recent intent.
    limit = Math.min(parsed, SLOTS_MAX)
  }
  return limit
}
