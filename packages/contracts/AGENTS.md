# Contracts package guide

See [the root AGENTS.md](../../AGENTS.md). Read [README.md](README.md) before changing this package;
it owns the package responsibilities, boundaries, and change contract.

Keep cross-boundary IDs branded and parse wire, configuration, user-input, and durable values with
their owning Zod schemas. Add producer/consumer coverage for changed contracts. Do not move rule,
storage, server, asset, or browser behavior into this package.
