import type { FastifyReply, FastifyRequest } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { loadPromptCore } from '@agentwolf/assets/prompts'
import {
  PostgamePlayerRatingSchema,
  PostgameReviewScoresSchema,
  PostgameReviewSubmissionInputSchema,
  SheriffActionKindSchema,
} from '@agentwolf/contracts'
import type { ActionMailbox } from './action-mailbox.js'

const promptCore = loadPromptCore()
const postgameScoresInputSchema = z
  .object({
    information: PostgameReviewScoresSchema.shape.information.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.scores.information'),
    ),
    communication: PostgameReviewScoresSchema.shape.communication.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.scores.communication'),
    ),
    decision: PostgameReviewScoresSchema.shape.decision.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.scores.decision'),
    ),
    objective: PostgameReviewScoresSchema.shape.objective.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.scores.objective'),
    ),
    adaptability: PostgameReviewScoresSchema.shape.adaptability.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.scores.adaptability'),
    ),
  })
  .strict()
const postgameRatingInputSchema = z
  .object({
    playerId: PostgamePlayerRatingSchema.shape.playerId.describe(
      promptCore.toolField('submit_postgame_review', 'ratings.playerId'),
    ),
    scores: postgameScoresInputSchema,
  })
  .strict()

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function toolResult(operation: () => unknown) {
  try {
    const receipt = operation()
    return {
      content: [{ type: 'text' as const, text: promptCore.acceptedReceipt() }],
      structuredContent: receipt as Record<string, unknown>,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: promptCore.rejectedReceipt(reason),
        },
      ],
    }
  }
}

function createPlayerMcpServer(mailbox: ActionMailbox, token: string): McpServer {
  const binding = mailbox.binding(token)
  const expectation = binding ? mailbox.peekExpectation(binding.matchId, binding.playerId) : null
  const boundAbilityContracts = binding?.abilityContracts ?? []
  const boundNightContracts = boundAbilityContracts.filter((contract) =>
    contract.actionTypes.includes('night-action'),
  )
  const boundTriggerContracts = boundAbilityContracts.filter((contract) =>
    contract.actionTypes.includes('skill-trigger'),
  )
  const nightAbilityIds =
    expectation?.actionType === 'night-action'
      ? expectation.allowedAbilityIds
      : boundNightContracts.map((contract) => contract.abilityId)
  const triggerAbilityIds =
    expectation?.actionType === 'skill-trigger'
      ? expectation.allowedAbilityIds
      : (expectation?.interruptAbilityIds ??
        boundTriggerContracts.map((contract) => contract.abilityId))
  const nightAbilityContracts = contractsFor(
    nightAbilityIds,
    expectation?.actionType === 'night-action' ? expectation.abilityContracts : boundNightContracts,
  )
  const roleCardChoices = expectation?.roleCardChoices ?? []
  const selectableRoleCards = roleCardChoices.filter((choice) => choice.selectable)
  const triggerAbilityContracts = contractsFor(
    triggerAbilityIds,
    expectation?.abilityContracts ?? boundTriggerContracts,
  )
  const server = new McpServer({ name: 'agentwolf-player-actions', version: '0.1.0' })
  const speechTool = promptCore.tool('submit_speech')
  const voteTool = promptCore.tool('submit_vote')
  const nightTool = promptCore.tool('submit_night_action')
  const sheriffTool = promptCore.tool('submit_sheriff_action')
  const skillTool = promptCore.tool('trigger_skill')
  const passSkillTool = promptCore.tool('pass_skill')
  const postgameReviewTool = promptCore.tool('submit_postgame_review')
  server.registerTool(
    'submit_speech',
    {
      title: speechTool.title,
      description: speechTool.description,
      inputSchema: {
        text: z.string().min(1).max(8_000).describe(promptCore.toolField('submit_speech', 'text')),
      },
    },
    ({ text }) => toolResult(() => mailbox.submitSpeech(token, text)),
  )
  server.registerTool(
    'submit_vote',
    {
      title: voteTool.title,
      description: voteTool.description,
      inputSchema: {
        targetPlayerId: z
          .string()
          .nullable()
          .describe(promptCore.toolField('submit_vote', 'targetPlayerId')),
      },
    },
    ({ targetPlayerId }) => toolResult(() => mailbox.submitVote(token, targetPlayerId)),
  )
  server.registerTool(
    'submit_night_action',
    {
      title: nightTool.title,
      description: nightTool.description,
      inputSchema: {
        abilityId: constrainedString(
          nightAbilityIds,
          promptCore.toolField('submit_night_action', 'abilityId'),
          nightAbilityContracts,
        ),
        targetPlayerIds: z
          .array(z.string())
          .max(roleCardChoices.length > 0 ? 0 : 3)
          .describe(promptCore.toolField('submit_night_action', 'targetPlayerIds')),
        roleCardId:
          selectableRoleCards.length > 0
            ? constrainedChoiceString(
                selectableRoleCards,
                promptCore.toolField('submit_night_action', 'roleCardId'),
              )
            : z
                .string()
                .optional()
                .describe(promptCore.toolField('submit_night_action', 'roleCardId')),
        option: z
          .string()
          .optional()
          .describe(promptCore.toolField('submit_night_action', 'option')),
      },
    },
    ({ abilityId, targetPlayerIds, option, roleCardId }) =>
      toolResult(() =>
        mailbox.submitNightAction(token, abilityId, targetPlayerIds, option, roleCardId),
      ),
  )
  server.registerTool(
    'submit_sheriff_action',
    {
      title: sheriffTool.title,
      description: sheriffTool.description,
      inputSchema: {
        action:
          expectation?.allowedSheriffActions && expectation.allowedSheriffActions.length > 0
            ? constrainedString(
                expectation.allowedSheriffActions,
                promptCore.toolField('submit_sheriff_action', 'action'),
                undefined,
              )
            : SheriffActionKindSchema.describe(
                promptCore.toolField('submit_sheriff_action', 'action'),
              ),
        targetPlayerId: z
          .string()
          .optional()
          .describe(promptCore.toolField('submit_sheriff_action', 'targetPlayerId')),
      },
    },
    ({ action, targetPlayerId }) =>
      toolResult(() =>
        mailbox.submitSheriffAction(token, SheriffActionKindSchema.parse(action), targetPlayerId),
      ),
  )
  server.registerTool(
    'trigger_skill',
    {
      title: skillTool.title,
      description: skillTool.description,
      inputSchema: {
        abilityId: constrainedString(
          triggerAbilityIds,
          promptCore.toolField('trigger_skill', 'abilityId'),
          triggerAbilityContracts,
        ),
        targetPlayerId: z
          .string()
          .optional()
          .describe(promptCore.toolField('trigger_skill', 'targetPlayerId')),
      },
    },
    ({ abilityId, targetPlayerId }) =>
      toolResult(() => mailbox.submitSkillTrigger(token, abilityId, targetPlayerId)),
  )
  server.registerTool(
    'pass_skill',
    {
      title: passSkillTool.title,
      description: passSkillTool.description,
      inputSchema: {},
    },
    () => toolResult(() => mailbox.submitSkillPass(token)),
  )
  server.registerTool(
    'submit_postgame_review',
    {
      title: postgameReviewTool.title,
      description: postgameReviewTool.description,
      inputSchema: {
        mvpPlayerId: PostgameReviewSubmissionInputSchema.shape.mvpPlayerId.describe(
          promptCore.toolField('submit_postgame_review', 'mvpPlayerId'),
        ),
        svpPlayerId: PostgameReviewSubmissionInputSchema.shape.svpPlayerId.describe(
          promptCore.toolField('submit_postgame_review', 'svpPlayerId'),
        ),
        ratings: z
          .array(postgameRatingInputSchema)
          .min(1)
          .max(23)
          .describe(promptCore.toolField('submit_postgame_review', 'ratings')),
      },
    },
    (input) => toolResult(() => mailbox.submitPostgameReview(token, input)),
  )
  return server
}

function constrainedString(
  values: readonly string[] | undefined,
  description: string,
  abilityContracts:
    | readonly {
        readonly abilityId: string
        readonly label: string
        readonly description: string
      }[]
    | undefined,
) {
  const unique = [...new Set(values ?? [])]
  const contracts = new Map(
    (abilityContracts ?? []).map((contract) => [String(contract.abilityId), contract]),
  )
  const schemaFor = (value: string) => {
    const contract = contracts.get(value)
    return z
      .literal(value)
      .describe(contract ? `${contract.label}：${contract.description}` : description)
  }
  if (unique.length === 1) return schemaFor(unique[0]!)
  if (unique.length > 1) {
    return z
      .union(unique.map(schemaFor) as [ReturnType<typeof schemaFor>, ReturnType<typeof schemaFor>])
      .describe(description)
  }
  return z.string().describe(description)
}

function contractsFor<T extends { readonly abilityId: string }>(
  abilityIds: readonly string[] | undefined,
  contracts: readonly T[] | undefined,
): readonly T[] {
  if (!abilityIds?.length || !contracts?.length) return []
  const allowed = new Set(abilityIds)
  return contracts.filter((contract) => allowed.has(contract.abilityId))
}

function constrainedChoiceString(
  choices: readonly { readonly cardId: string; readonly label: string }[],
  description: string,
) {
  const schemaFor = (choice: (typeof choices)[number]) =>
    z.literal(choice.cardId).describe(`${choice.label}：${description}`)
  if (choices.length === 1) return schemaFor(choices[0]!)
  return z
    .union(choices.map(schemaFor) as [ReturnType<typeof schemaFor>, ReturnType<typeof schemaFor>])
    .describe(description)
}

export async function handleMcpRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  mailbox: ActionMailbox,
): Promise<void> {
  const token = bearerToken(request)
  if (!token || !mailbox.binding(token)) {
    await reply.code(401).send({ error: 'invalid-player-token' })
    return
  }
  if (request.method !== 'POST') {
    await reply.code(405).send({ error: 'method-not-allowed' })
    return
  }
  const server = createPlayerMcpServer(mailbox, token)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0])
  reply.hijack()
  try {
    await server.connect(transport as unknown as Transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  } finally {
    await transport.close()
    await server.close()
  }
}
