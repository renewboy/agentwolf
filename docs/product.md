# AgentWolf product

AgentWolf is a local-first spectator platform for multi-agent Werewolf matches. A match assigns one reusable Agent Profile to every seat, creates one long-lived ACP session per player, and lets the rule engine conduct the game.

## V1 game catalog

The role catalog contains Villager, Werewolf, Seer, Witch, Hunter, Idiot, and Guard. The board catalog contains:

- 6-player Quick: two Werewolves, two Villagers, Seer, Hunter.
- 9-player Standard: three Werewolves, three Villagers, Seer, Witch, Hunter.
- 12-player Standard: four Werewolves, four Villagers, Seer, Witch, Hunter, Idiot.
- 12-player Guard: four Werewolves, four Villagers, Seer, Witch, Hunter, Guard.

The 6-player board has no sheriff and uses slaughter-all victory. The 9-player and 12-player boards use sheriff election and slaughter-edge victory. Custom board manifests can compose the V1 roles and policies.

Player identities remain hidden after death and exile. A role-specific public reveal, such as the Idiot surviving exile, remains part of that role's behavior. After the match ends, the server publishes every player's final identity.

## Setup

The Agent settings screen creates, edits, probes, and deletes Agent Profiles. Selecting an Agent Tool opens a temporary ACP session and reads its advertised model configuration; the model is selected from that returned list. A profile combines the tool, selected model, and non-secret connection settings. Environment-variable references supply credentials.

The new-match screen selects a player count and then a compatible board, assigns an Agent Profile to each seat, and edits or rerolls player names. The nickname generator composes curated word lists and guarantees uniqueness inside a match. Starting a match assigns `player-1` through `player-N` by seat order.

## Match experience

The spectator screen is a fixed-height live match stage. Player rosters run down the left and right edges, while the center presents streamed speech, public events, night information allowed by the selected view, voting results, and audio playback through the browser Speech Synthesis API. Resolved votes group voter seat numbers under each target seat number. The central history scrolls independently and can be folded by match day.

One connected spectator window can control automatic speech playback. Every player speech visible in that window's selected view enters a sequence-ordered playback queue. Agent speech generation may continue inside the current speech stage, while its final speech holds the following phase until the queue completes or the spectator skips it. Closing the controlling connection releases the hold. Every committed speech also has manual play and stop controls that do not affect match progression.

View projections are server-owned:

- God view includes roles, private actions, and all public events.
- Closed-eye view includes only information publicly announced by the judge.
- Player view includes the selected player's public information, private role knowledge, faction knowledge, and private results.

Developer mode appears as a reserved settings entry. Runtime trajectory inspection is outside V1.

## Player identity

Every player has a readable `player-N` ID, a numbered seat, and a nickname. Prompts bind all three. Structured actions use Player IDs. Public speech and last words use nicknames or seat labels.

Speech is checked before it enters the public event log. Known Player IDs are rewritten to nicknames; an unknown `player-N` token rejects the speech and pauses the turn for correction.

## Match failure behavior

An agent process exit, prompt timeout, malformed structured action, or uncertain prompt delivery activates bounded recovery. One uncertain transport failure per player and phase replaces failed sessions and retries without changing game state. A repeated transport failure or invalid structured action pauses with an operator-visible reason and continue action. Live sessions retain their acknowledged cursors; replacement sessions receive one current foundation plus each player's visible history. Matches can be deleted with their events and delivery ledgers.

An ended Match is a stable record: every identity is visible, every player Session is presented as ended, and the spectator connection settles without reconnecting. A deleted or unknown Match returns a terminal unavailable response rather than entering live recovery.
