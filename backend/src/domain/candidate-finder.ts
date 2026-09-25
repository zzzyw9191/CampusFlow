import type { createCampusItemRepository } from '../data/campus-item-repository.js'
import type { CampusItem, CampusItemKind } from './campus-item.js'

export const DEFAULT_CANDIDATE_LIMIT = 20

export type CandidateSearchInput = {
  kind: CampusItemKind
  source: string
  conversationId: string | null
}

type CandidateRepository = Pick<ReturnType<typeof createCampusItemRepository>, 'findActiveCampusItems'>

export class CandidateFinder {
  constructor(
    private readonly repository: CandidateRepository,
    private readonly limit = DEFAULT_CANDIDATE_LIMIT,
  ) {}

  find(input: CandidateSearchInput): CampusItem[] {
    return this.repository.findActiveCampusItems({ ...input, limit: this.limit })
  }
}
