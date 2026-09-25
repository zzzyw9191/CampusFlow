import type { CampusItem } from './campus-item.js'
import type { CampusItemReference } from './campus-item-reference.js'

export type EntityResolution =
  | { status: 'resolved'; item: CampusItem }
  | { status: 'ambiguous'; candidates: CampusItem[] }
  | { status: 'not_found' }
  | { status: 'insufficient_reference'; candidates: CampusItem[] }

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

function usableText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return normalizeText(value) || undefined
}

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/u
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u

function matchesTime(reference: string, candidate: string | null): boolean {
  if (candidate === null) return false
  if (dateOnlyPattern.test(reference)) {
    return (dateOnlyPattern.test(candidate) || dateTimePattern.test(candidate))
      && candidate.slice(0, 10) === reference
  }
  if (!dateTimePattern.test(reference) || !dateTimePattern.test(candidate)) return false
  const referenceTime = Date.parse(reference)
  const candidateTime = Date.parse(candidate)
  return Number.isFinite(referenceTime) && referenceTime === candidateTime
}

type Match = { item: CampusItem; strongEvidence: boolean }

function matchCandidate(reference: CampusItemReference, item: CampusItem): Match | null {
  let strongEvidence = false
  const title = usableText(reference.title)
  if (title !== undefined) {
    const candidateTitle = normalizeText(item.title)
    if (title === candidateTitle) {
      strongEvidence = true
    } else if (!candidateTitle || !candidateTitle.includes(title) && !title.includes(candidateTitle)) {
      return null
    }
  }

  for (const field of ['course', 'location'] as const) {
    const value = usableText(reference[field])
    if (value === undefined) continue
    if (item[field] === null || normalizeText(item[field]) !== value) return null
    strongEvidence = true
  }

  for (const field of ['deadline', 'eventTime'] as const) {
    const value = reference[field]?.trim()
    if (!value) continue
    if (!matchesTime(value, item[field])) return null
    strongEvidence = true
  }

  return { item, strongEvidence }
}

export function resolveEntity(
  reference: CampusItemReference,
  candidates: CampusItem[],
): EntityResolution {
  const hasIdentification =
    usableText(reference.title) !== undefined
    || usableText(reference.course) !== undefined
    || usableText(reference.location) !== undefined
    || Boolean(reference.deadline?.trim())
    || Boolean(reference.eventTime?.trim())

  if (!hasIdentification) {
    return { status: 'insufficient_reference', candidates: [...candidates].sort((a, b) => a.id - b.id) }
  }

  const matches = candidates.flatMap((item) => {
    const match = matchCandidate(reference, item)
    return match === null ? [] : [match]
  }).sort((a, b) => a.item.id - b.item.id)

  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map(({ item }) => item) }
  const [match] = matches
  if (match.strongEvidence) return { status: 'resolved', item: match.item }
  return { status: 'insufficient_reference', candidates: [match.item] }
}
