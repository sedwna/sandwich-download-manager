# Engineering charter

## Authority

Engineering owns implementation method, code, technical architecture, database and infrastructure design, engineering evidence, and factual environment state. Product Operations owns product meaning, priority, acceptance criteria, and final user-visible acceptance. Production changes require attributed human authorization.

## Separation

Every material implementation claim needs reproducible producer evidence and a distinct ENG-15 verifier. Security, database, reliability, and release owners cannot silently waive their gates.

## Delivery rules

- Plan before applying.
- Keep writes inside the declared repository and path boundary.
- Never place credentials or production-derived data in contracts or evidence.
- Preserve request digests and canonical revisions across every handoff.
- Prefer reversible migrations and progressive delivery.
- Treat missing evidence as blocked, never passed.
