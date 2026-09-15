# Databases are replicas, not mocks

Some agents do not have tools. They write SQL, or their tools sit on the team's own backend behind a connection string. To test one of those we have to be *where the data is*, which means AgentSim must be able to hand a Run a database rather than a tool endpoint (Integration shape D). The decision is what that database is.

It is a **replica**: a per-Run SQLite or Postgres seeded from the World pack's Seed, carrying the team's own schema — its types, `NOT NULL`s, `UNIQUE`s, `CHECK`s and foreign keys — and their row-level policies where they have them. The agent swaps one connection string; every statement it issues is executed for real against that schema and captured as an Event, so the same Checks, the same Violations and the same Trust Score come out as for a tool-driven Run. The replica is dropped when the Run ends.

Consequence: constraints are part of the simulation rather than something we reimplement. An agent that writes an impossible row gets a constraint error, as it would in production, and the error is an Event we can score. It also means the World engine has to sit behind a storage interface with in-memory and SQL implementations that pass the same test suite — the in-memory one is all that exists today, so Shape D is designed and unbuilt.

Rejected: stubbing the query functions and returning canned rows. It is easy and it fakes exactly the one thing — the constraints — that makes a database worth testing against. Also rejected: pointing the agent at a shared long-lived test database, which loses per-Run isolation and makes a Run unrepeatable.
