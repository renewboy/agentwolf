import { AbilityIdSchema, PhaseIdSchema } from '@agentwolf/contracts'
import type { PhaseGraph, PhaseNode } from '../../types.js'
import { classicCapabilities } from './capabilities.js'

function phase(value: string): ReturnType<typeof PhaseIdSchema.parse> {
  return PhaseIdSchema.parse(value)
}

const ability = (value: string) => AbilityIdSchema.parse(value)
const werewolfKillAbilityId = ability('ability-werewolf-kill')
const sheriffElectionInterrupts = [
  {
    handlerId: 'classic-day-detonation',
    capabilityIds: [classicCapabilities.wolfSelfDestruct, classicCapabilities.whiteWolfDetonate],
    context: 'sheriff-election',
    visibility: 'public',
  },
] as const
const daytimeInterrupts = [
  {
    handlerId: 'classic-day-detonation',
    capabilityIds: [classicCapabilities.wolfSelfDestruct, classicCapabilities.whiteWolfDetonate],
    context: 'daytime',
    visibility: 'public',
  },
] as const

const nodes: PhaseNode[] = [
  {
    id: phase('phase-night-wolf-council'),
    labelKey: 'phases.nightWolfCouncil',
    mode: 'sequential',
    action: {
      type: 'speech',
      kind: 'wolf-council',
      visibility: { kind: 'faction', faction: 'werewolf' },
    },
    actorSelector: `capability-alive:${classicCapabilities.wolfCouncil}`,
    edges: [{ to: phase('phase-night-wolf-vote') }],
  },
  {
    id: phase('phase-night-wolf-vote'),
    labelKey: 'phases.nightWolfVote',
    mode: 'parallel',
    action: {
      type: 'vote',
      kind: 'wolf-kill',
      visibility: { kind: 'faction', faction: 'werewolf' },
      abilityId: werewolfKillAbilityId,
    },
    actorSelector: `capability-alive:${classicCapabilities.wolfKill}`,
    edges: [{ to: phase('phase-night-resolve') }],
  },
  {
    id: phase('phase-night-resolve'),
    labelKey: 'phases.nightResolve',
    mode: 'automatic',
    edges: [
      { to: phase('phase-day-announcement'), when: 'has-winner' },
      { to: phase('phase-sheriff-signup'), when: 'first-day-with-sheriff' },
      { to: phase('phase-day-announcement') },
    ],
  },
  {
    id: phase('phase-sheriff-signup'),
    labelKey: 'phases.sheriffSignup',
    mode: 'parallel',
    action: {
      type: 'sheriff-action',
      actions: ['join', 'decline'],
      visibility: 'public',
    },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'publicly-alive',
    edges: [
      { to: phase('phase-sheriff-speech'), when: 'multiple-standing-candidates' },
      { to: phase('phase-sheriff-resolve') },
    ],
  },
  {
    id: phase('phase-sheriff-speech'),
    labelKey: 'phases.sheriffSpeech',
    mode: 'sequential',
    action: { type: 'speech', kind: 'sheriff', visibility: 'public' },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'standing-sheriff-candidates',
    edges: [{ to: phase('phase-sheriff-withdraw') }],
  },
  {
    id: phase('phase-sheriff-withdraw'),
    labelKey: 'phases.sheriffWithdraw',
    mode: 'parallel',
    action: {
      type: 'sheriff-action',
      actions: ['withdraw', 'keep-running'],
      visibility: 'public',
    },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'standing-sheriff-candidates',
    edges: [
      { to: phase('phase-sheriff-vote'), when: 'multiple-standing-candidates' },
      { to: phase('phase-sheriff-resolve') },
    ],
  },
  {
    id: phase('phase-sheriff-vote'),
    labelKey: 'phases.sheriffVote',
    mode: 'parallel',
    action: { type: 'vote', kind: 'sheriff', visibility: 'actor' },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'original-sheriff-noncandidates',
    edges: [
      { to: phase('phase-sheriff-runoff-speech'), when: 'sheriff-vote-tied' },
      { to: phase('phase-sheriff-resolve') },
    ],
  },
  {
    id: phase('phase-sheriff-runoff-speech'),
    labelKey: 'phases.sheriffRunoffSpeech',
    mode: 'sequential',
    action: { type: 'speech', kind: 'runoff', visibility: 'public' },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'sheriff-tied-candidates',
    edges: [{ to: phase('phase-sheriff-runoff-vote') }],
  },
  {
    id: phase('phase-sheriff-runoff-vote'),
    labelKey: 'phases.sheriffRunoffVote',
    mode: 'parallel',
    action: { type: 'vote', kind: 'sheriff-runoff', visibility: 'actor' },
    interrupts: sheriffElectionInterrupts,
    actorSelector: 'original-sheriff-noncandidates',
    edges: [{ to: phase('phase-sheriff-resolve') }],
  },
  {
    id: phase('phase-sheriff-resolve'),
    labelKey: 'phases.sheriffResolve',
    mode: 'automatic',
    edges: [{ to: phase('phase-day-announcement') }],
  },
  {
    id: phase('phase-day-announcement'),
    labelKey: 'phases.dayAnnouncement',
    mode: 'automatic',
    edges: [
      { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
      { to: phase('phase-match-ended'), when: 'has-winner' },
      { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
      { to: phase('phase-last-words'), when: 'has-last-words' },
      { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
      { to: phase('phase-day-speech-order') },
    ],
  },
  {
    id: phase('phase-sheriff-transfer'),
    labelKey: 'phases.sheriffTransfer',
    mode: 'parallel',
    action: {
      type: 'skill-trigger',
      abilityIds: [ability('ability-sheriff-transfer')],
      validation: 'sheriff-transfer',
      visibility: 'public',
    },
    actorSelector: 'dead-sheriff',
    edges: [
      { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
      { to: phase('phase-match-ended'), when: 'has-winner' },
      { to: phase('phase-last-words'), when: 'has-last-words' },
      { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
      { to: phase('phase-day-speech-order') },
    ],
  },
  {
    id: phase('phase-death-triggers'),
    labelKey: 'phases.deathTriggers',
    mode: 'sequential',
    action: {
      type: 'skill-trigger',
      abilityIds: [],
      abilitySource: 'decision-trigger',
      triggerSignal: 'player-death',
      validation: 'role-ability',
      visibility: 'actor',
    },
    actorSelector: 'pending-death-trigger-owners',
    edges: [
      { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
      { to: phase('phase-match-ended'), when: 'has-winner' },
      { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
      { to: phase('phase-last-words'), when: 'has-last-words' },
      { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
      { to: phase('phase-day-speech-order') },
    ],
  },
  {
    id: phase('phase-last-words'),
    labelKey: 'phases.lastWords',
    mode: 'sequential',
    action: { type: 'speech', kind: 'last-words', visibility: 'public' },
    actorSelector: 'last-words-eligible',
    edges: [
      { to: phase('phase-match-ended'), when: 'has-winner' },
      { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
      { to: phase('phase-day-speech-order') },
    ],
  },
  {
    id: phase('phase-day-speech-order'),
    labelKey: 'phases.daySpeechOrder',
    mode: 'parallel',
    action: {
      type: 'sheriff-action',
      actions: ['speech-clockwise', 'speech-counterclockwise'],
      visibility: 'public',
    },
    actorSelector: 'sheriff-or-system',
    edges: [{ to: phase('phase-day-speech') }],
  },
  {
    id: phase('phase-day-speech'),
    labelKey: 'phases.daySpeech',
    mode: 'sequential',
    action: { type: 'speech', kind: 'day', visibility: 'public' },
    interrupts: daytimeInterrupts,
    actorSelector: 'day-speech-order',
    edges: [{ to: phase('phase-day-vote') }],
  },
  {
    id: phase('phase-day-vote'),
    labelKey: 'phases.dayVote',
    mode: 'parallel',
    action: { type: 'vote', kind: 'exile', visibility: 'actor' },
    interrupts: daytimeInterrupts,
    actorSelector: 'eligible-voters',
    edges: [
      { to: phase('phase-day-runoff-speech'), when: 'exile-vote-tied' },
      { to: phase('phase-day-resolve') },
    ],
  },
  {
    id: phase('phase-day-runoff-speech'),
    labelKey: 'phases.dayRunoffSpeech',
    mode: 'sequential',
    action: { type: 'speech', kind: 'runoff', visibility: 'public' },
    interrupts: daytimeInterrupts,
    actorSelector: 'exile-tied-players',
    edges: [{ to: phase('phase-day-runoff-vote') }],
  },
  {
    id: phase('phase-day-runoff-vote'),
    labelKey: 'phases.dayRunoffVote',
    mode: 'parallel',
    action: { type: 'vote', kind: 'exile-runoff', visibility: 'actor' },
    interrupts: daytimeInterrupts,
    actorSelector: 'eligible-runoff-voters',
    edges: [{ to: phase('phase-day-resolve') }],
  },
  {
    id: phase('phase-day-resolve'),
    labelKey: 'phases.dayResolve',
    mode: 'automatic',
    edges: [
      { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
      { to: phase('phase-match-ended'), when: 'has-winner' },
      { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
      { to: phase('phase-last-words'), when: 'has-last-words' },
      { to: phase('phase-night-guard') },
    ],
  },
  {
    id: phase('phase-match-ended'),
    labelKey: 'phases.matchEnded',
    mode: 'automatic',
    edges: [],
  },
]

export const classicBasePhaseGraph: PhaseGraph = {
  id: 'classic-sheriff-v1',
  entry: phase('phase-night-wolf-council'),
  nodes: new Map(nodes.map((node) => [node.id, node])),
}
