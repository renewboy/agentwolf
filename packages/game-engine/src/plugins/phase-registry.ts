import type { PhaseId } from '@agentwolf/contracts'
import type { PhaseGraph, PhaseNode } from '../types.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export interface PhaseInsertion {
  readonly node: PhaseNode
  readonly after: PhaseId | null
  readonly before: PhaseId
  readonly rewireIncoming?: boolean
}

export class PhaseGraphRegistry {
  #graphId: string | null = null
  #entry: PhaseId | null = null
  readonly #nodes = new Map<PhaseId, PhaseNode>()
  readonly #insertions: PhaseInsertion[] = []

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public configure(options: { readonly id: string; readonly entry: PhaseId }): void {
    if (this.#graphId) throw new Error(`Duplicate phase graph ${options.id}`)
    this.#graphId = options.id
    this.#entry = options.entry
  }

  public register(node: PhaseNode): void {
    if (this.#nodes.has(node.id) || this.#insertions.some((entry) => entry.node.id === node.id)) {
      throw new Error(`Duplicate phase node ${node.id}`)
    }
    this.ownership?.phase(node.id)
    this.#nodes.set(node.id, { ...node, edges: [...node.edges] })
  }

  public registerAll(nodes: readonly PhaseNode[]): void {
    for (const node of nodes) this.register(node)
  }

  public registerBase(graph: PhaseGraph): void {
    this.configure({ id: graph.id, entry: graph.entry })
    this.registerAll([...graph.nodes.values()])
  }

  public insert(insertion: PhaseInsertion): void {
    if (
      this.#nodes.has(insertion.node.id) ||
      this.#insertions.some((entry) => entry.node.id === insertion.node.id)
    ) {
      throw new Error(`Duplicate phase insertion ${insertion.node.id}`)
    }
    this.ownership?.phase(insertion.node.id)
    this.#insertions.push(insertion)
  }

  public build(): PhaseGraph {
    if (!this.#graphId || !this.#entry) throw new Error('Ruleset has no configured phase graph')
    const nodes = new Map<PhaseId, PhaseNode>(
      [...this.#nodes].map(([id, node]) => [id, { ...node, edges: [...node.edges] }]),
    )
    for (const insertion of this.#insertions) {
      if (nodes.has(insertion.node.id)) throw new Error(`Duplicate phase node ${insertion.node.id}`)
      nodes.set(insertion.node.id, { ...insertion.node, edges: [{ to: insertion.before }] })
    }

    let entry = this.#entry
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
        if (insertion.rewireIncoming) {
          for (const [nodeId, node] of nodes) {
            if (nodeId === insertion.node.id) continue
            const edges = node.edges.map((edge) =>
              edge.to === insertion.before ? { ...edge, to: insertion.node.id } : edge,
            )
            nodes.set(nodeId, { ...node, edges })
          }
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
    validateReachability(entry, nodes)
    return { id: this.#graphId, entry, nodes }
  }
}

function validateReachability(entry: PhaseId, nodes: ReadonlyMap<PhaseId, PhaseNode>): void {
  if (!nodes.has(entry)) throw new Error(`Phase graph entry ${entry} is missing`)
  const reachable = new Set<PhaseId>()
  const pending = [entry]
  while (pending.length > 0) {
    const phaseId = pending.pop()!
    if (reachable.has(phaseId)) continue
    reachable.add(phaseId)
    const node = nodes.get(phaseId)
    if (!node) throw new Error(`Phase graph references missing ${phaseId}`)
    for (const edge of node.edges) pending.push(edge.to)
  }
  const unreachable = [...nodes.keys()].filter((phaseId) => !reachable.has(phaseId))
  if (unreachable.length > 0) {
    throw new Error(`Phase graph has unreachable nodes: ${unreachable.join(', ')}`)
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
