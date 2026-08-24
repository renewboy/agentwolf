import type { PhaseId } from '@agentwolf/contracts'
import type { PhaseGraph, PhaseNode } from '../types.js'

export interface PhaseInsertion {
  readonly node: PhaseNode
  readonly after: PhaseId | null
  readonly before: PhaseId
}

export class PhaseGraphRegistry {
  #base: PhaseGraph | null = null
  readonly #insertions: PhaseInsertion[] = []

  public registerBase(graph: PhaseGraph): void {
    if (this.#base) throw new Error(`Duplicate base phase graph ${graph.id}`)
    this.#base = graph
  }

  public insert(insertion: PhaseInsertion): void {
    if (this.#insertions.some((entry) => entry.node.id === insertion.node.id)) {
      throw new Error(`Duplicate phase insertion ${insertion.node.id}`)
    }
    this.#insertions.push(insertion)
  }

  public build(): PhaseGraph {
    if (!this.#base) throw new Error('Ruleset has no base phase graph')
    const nodes = new Map<PhaseId, PhaseNode>(
      [...this.#base.nodes].map(([id, node]) => [id, { ...node, edges: [...node.edges] }]),
    )
    for (const insertion of this.#insertions) {
      if (nodes.has(insertion.node.id)) throw new Error(`Duplicate phase node ${insertion.node.id}`)
      nodes.set(insertion.node.id, { ...insertion.node, edges: [{ to: insertion.before }] })
    }

    let entry = this.#base.entry
    for (const insertion of orderedInsertions(this.#insertions)) {
      if (!nodes.has(insertion.before)) {
        throw new Error(`Phase ${insertion.node.id} targets missing ${insertion.before}`)
      }
      if (insertion.after === null) {
        if (entry !== insertion.before) {
          throw new Error(
            `Phase ${insertion.node.id} cannot precede ${insertion.before}; current entry is ${entry}`,
          )
        }
        entry = insertion.node.id
        continue
      }
      const previous = nodes.get(insertion.after)
      if (!previous)
        throw new Error(`Phase ${insertion.node.id} follows missing ${insertion.after}`)
      const edgeIndex = previous.edges.findIndex((edge) => edge.to === insertion.before)
      if (edgeIndex < 0) {
        throw new Error(
          `Phase ${insertion.node.id} cannot insert between ${insertion.after} and ${insertion.before}`,
        )
      }
      const edges = [...previous.edges]
      edges[edgeIndex] = { ...edges[edgeIndex]!, to: insertion.node.id }
      nodes.set(previous.id, { ...previous, edges })
    }

    for (const node of nodes.values()) {
      for (const edge of node.edges) {
        if (!nodes.has(edge.to)) throw new Error(`Phase ${node.id} targets missing ${edge.to}`)
      }
    }
    return { id: this.#base.id, entry, nodes }
  }
}

function orderedInsertions(insertions: readonly PhaseInsertion[]): PhaseInsertion[] {
  const byNode = new Map(insertions.map((insertion) => [insertion.node.id, insertion]))
  const visiting = new Set<PhaseId>()
  const visited = new Set<PhaseId>()
  const ordered: PhaseInsertion[] = []
  const visit = (insertion: PhaseInsertion, path: readonly PhaseId[]): void => {
    if (visited.has(insertion.node.id)) return
    if (visiting.has(insertion.node.id)) {
      throw new Error(`Phase insertion cycle: ${[...path, insertion.node.id].join(' -> ')}`)
    }
    visiting.add(insertion.node.id)
    if (insertion.after) {
      const dependency = byNode.get(insertion.after)
      if (dependency) visit(dependency, [...path, insertion.node.id])
    }
    visiting.delete(insertion.node.id)
    visited.add(insertion.node.id)
    ordered.push(insertion)
  }
  for (const insertion of insertions) visit(insertion, [])
  return ordered
}
