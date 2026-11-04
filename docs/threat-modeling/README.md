# Threat-modeling context

Use this folder as the starting point for an AI-assisted threat-modeling tool. The system description is a guide to scope and repository evidence, not a substitute for inspecting the source and deployment template.

## Suggested analysis sequence

1. Read [system-description.md](system-description.md) for the application purpose, deployment modes, components, data, flows, trust boundaries, and known limitations.
2. Inspect the referenced source files and `template.yaml` to confirm each statement against the current implementation.
3. Model the local browser demo and the AWS-backed deployment separately. Do not combine their authentication, persistence, or network assumptions.
4. Treat Stripe, payment processing, and invoice generation as **not implemented**. The Stripe flow in `docs/architecture.md` is a proposed exercise only; the S3 invoice bucket is provisioned but unused by application code.
5. Identify threats and mitigations from the evidence. Label assumptions and open questions separately from verified repository facts. Do not present candidate risks as confirmed vulnerabilities without evidence.

## Expected model coverage

Consider:

- Actors and trust zones, including readers, sellers, browsers, AWS services, and deployment operators.
- Sensitive data and security-relevant operations, including authentication tokens, member identifiers, listings, prices, orders, and future invoice data.
- Data-flow threats across the browser, Cognito, API Gateway, Lambda, DynamoDB, and S3 boundaries.
- Authentication and authorization, input validation, marketplace integrity, concurrency, data exposure, availability/cost, operational access, and third-party/service dependencies.
- Controls that are implemented, controls that are only documented as intended, and areas with no control evidenced in the repository.

For each finding, include a concise scenario, affected component/data flow, evidence with repository file paths, impact, likelihood or confidence, and an actionable mitigation. Preserve the prototype's explicit limitations; do not assume production hosting, payment integration, invoice workflows, monitoring, or deployment automation exists.

## Repository evidence

| Area | Primary evidence |
|---|---|
| Browser UI, demo behavior, authentication, and API calls | `web/index.html`, `web/app.js`, `web/config.js` |
| API routes, identity use, validation, and order transaction | `src/app.py` |
| AWS resources, authorization, IAM, and storage configuration | `template.yaml` |
| Existing architecture and proposed Stripe exercise | `docs/architecture.md` |
| API behavior tests | `tests/test_app.py` |
| Runtime and deployment overview | `README.md` |
