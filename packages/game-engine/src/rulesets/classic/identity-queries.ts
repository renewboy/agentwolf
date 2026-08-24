import { z } from 'zod'
import { PlayerIdSchema, QueryTypeSchema, RoleIdSchema } from '@agentwolf/contracts'
import type { RulePlugin } from '../../plugins/loader.js'
import type { RulesetBuilder } from '../../plugins/ruleset.js'
import { classicPluginIds } from './plugins/ids.js'

export const classicIdentityQueries = {
  alignment: QueryTypeSchema.parse('query-identity-alignment'),
  exactRole: QueryTypeSchema.parse('query-identity-exact-role'),
} as const

const inputSchema = z.object({ targetId: PlayerIdSchema })

export const classicIdentityQueryPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.identityQueries,
  version: 1,
  register: ({ queries }) => {
    queries.register({
      type: classicIdentityQueries.alignment,
      inputSchema,
      resultSchema: z.enum(['village', 'werewolf']),
      resolve: ({ targetId }, context) => {
        const target = context.state.players.get(targetId)
        if (!target?.roleId) throw new Error(`Cannot inspect unknown role for ${targetId}`)
        return context.roles.role(target.roleId).faction === 'werewolf' ? 'werewolf' : 'village'
      },
    })
    queries.register({
      type: classicIdentityQueries.exactRole,
      inputSchema,
      resultSchema: RoleIdSchema,
      resolve: ({ targetId }, context) => {
        const target = context.state.players.get(targetId)
        if (!target?.roleId) throw new Error(`Cannot inspect unknown role for ${targetId}`)
        return target.roleId
      },
    })
  },
}
