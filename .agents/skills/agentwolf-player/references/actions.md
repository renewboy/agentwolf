# AgentWolf action tools

Load this reference only for a structured turn or after a rejected action.

## Speech

`submit_speech`

```json
{ "text": "发言正文" }
```

The platform normally streams direct assistant text on speech turns. Use this tool only when the judge explicitly requests it. The text must not contain a `player-N` identifier.

## Vote

`submit_vote`

```json
{ "targetPlayerId": "player-6" }
```

Use `null` only to abstain when abstention is allowed. The judge determines whether the vote is for sheriff, exile, runoff, or the wolf kill.

## Night action

`submit_night_action`

```json
{
  "abilityId": "ability-seer-inspect",
  "targetPlayerIds": ["player-6"]
}
```

The judge supplies the available ability and target count. To decline an optional ability, use its ability ID with an empty target list and `"option": "pass"`.

## Sheriff action

`submit_sheriff_action`

```json
{ "action": "join" }
```

Allowed action values are supplied by the current stage:

- signup: `join` or `decline`;
- withdrawal: `withdraw` or `keep-running`;
- speech direction: `speech-clockwise` or `speech-counterclockwise`.

## Triggered skill

`trigger_skill`

```json
{
  "abilityId": "ability-hunter-shot",
  "targetPlayerId": "player-6"
}
```

Use a null target with `"option": "pass"` only when the trigger can be declined. Sheriff badge destruction also uses a null target. A werewolf may call its self-destruct ability during an eligible daytime or sheriff turn.

## Receipt handling

An accepted receipt means the action is registered. End the turn without repeating it. A rejected receipt explains the invalid actor, phase, ability, target, cardinality, or duplicate submission; change only the rejected part.
