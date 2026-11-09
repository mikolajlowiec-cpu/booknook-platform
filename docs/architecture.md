# BookNook architecture and threat-modeling notes

For an AI-assisted threat-modeling run, begin with the [threat-modeling context](threat-modeling/README.md) and [system description](threat-modeling/system-description.md), then verify the claims against code and infrastructure.

## System overview

BookNook is a small book marketplace prototype. Members browse listings, post books for sale, and place a demo order. The implemented checkout records an order and marks a listing sold atomically; it does **not** take payment, calculate shipping, or issue tax/payment invoices. In AWS mode, a DynamoDB Stream triggers a separate Lambda that writes a minimal JSON order receipt to S3. The Stripe flow below is a proposed test-mode extension for threat-modeling exercises and is not implemented.

```mermaid
flowchart LR
  subgraph client["Reader-controlled device"]
    reader["Reader / browser<br/>untrusted client"]
  end
  subgraph aws["AWS account"]
    cognito["Amazon Cognito<br/>User Pool"]
    api["Amazon API Gateway<br/>HTTP API + JWT authorizer"]
    lambda["AWS Lambda<br/>BookNook API"]
    invoiceLambda["AWS Lambda<br/>Order receipt generator"]
    books[("Amazon DynamoDB<br/>BookListings")]
    orders[("Amazon DynamoDB<br/>Orders")]
    invoices[("Amazon S3<br/>Order receipts bucket<br/>private, encrypted, versioned")]
    orderStream[("DynamoDB Stream<br/>Orders: NEW_IMAGE")]
    secrets["AWS Secrets Manager<br/>Stripe test-mode API key<br/>and webhook secret"]
  end
  subgraph thirdparty["Third-party services"]
    stripe["Stripe<br/>Checkout + webhook events<br/>test mode only"]
  end

  reader -->|"HTTPS: sign-up, sign-in, email verification"| cognito
  reader -->|"HTTPS + Cognito ID token"| api
  api -->|"Verified JWT claims"| lambda
  lambda -->|"Scoped table permissions"| books
  lambda -->|"Scoped table permissions"| orders
  orders -->|"New order records"| orderStream
  orderStream -->|"At-least-once INSERT events"| invoiceLambda
  invoiceLambda -->|"PutObject: invoices/*"| invoices
  lambda -.->|"Proposed: create Checkout Session<br/>using server-side listing price"| stripe
  lambda -.->|"Proposed: retrieve test-mode secrets"| secrets
  reader -.->|"Proposed: redirect to Stripe-hosted Checkout<br/>and return to the storefront"| stripe
  stripe -.->|"Proposed: signed payment webhook<br/>to a dedicated unauthenticated route"| api
```

Solid lines show implemented components and flows; dashed lines show the proposed Stripe test-mode extension. The receipt generator writes a JSON order summary; this is not a tax/payment invoice, and there is no download route. The browser is served locally for this prototype. `web/config.js` points it at the deployed API and Cognito pool when configured.

## Trust boundaries and data

| Boundary | Data crossing it | Main controls |
|---|---|---|
| Reader device → Cognito | Email, password, verification code | Cognito-managed authentication; browser never receives an app-client secret |
| Reader device → API Gateway | Listing and order requests, Cognito ID token | HTTPS; API Gateway validates issuer and audience on every route |
| API Gateway → Lambda | Request body, route parameters, verified JWT claims | Lambda takes member ID from the verified `sub` claim, not from caller input |
| Lambda → DynamoDB | Listings and demo-order records | Function role limited to the two application tables; transactional checkout |
| Orders table → DynamoDB Stream → receipt Lambda | New order record image, including book title, price, buyer and seller IDs, and order metadata | Stream is configured with `NEW_IMAGE`; stream delivery is at least once; deterministic object key makes retries overwrite the current receipt, while S3 versioning can retain duplicate versions |
| Receipt Lambda → S3 bucket | Minimal JSON order receipt under the `invoices/` prefix; excludes buyer/seller IDs | Worker role can only `PutObject` under that prefix; S3 blocks public access, enforces TLS, encrypts objects at rest, and versions objects |
| BookNook backend → Stripe (proposed) | Checkout Session request with server-selected amount, currency, and opaque order reference; signed webhook events back to BookNook | Stripe test mode; keep API and webhook secrets server-side; verify webhook signatures; treat browser redirects as untrusted |
| Reader device ↔ Stripe (proposed) | Redirect to hosted Checkout and return URL; card details are entered directly on Stripe | HTTPS; do not collect or store card details in BookNook; a browser return is not proof of payment |

Sensitive or important data: member identifiers and email addresses, listing descriptions, prices, order history, stored order receipts, and authentication tokens in the browser session. The receipt worker handles the new order image, which includes buyer and seller IDs; its S3 receipt intentionally omits those IDs. The application does not store passwords or payment-card data. It does not issue tax/payment invoices. The proposed Stripe integration adds API and webhook secrets, and payment identifiers/statuses; secrets must not be sent to the browser or written to logs.

## Core flows

1. **Register and sign in:** browser calls Cognito User Pool APIs; the API client sends its Cognito ID token to the API.
2. **Browse:** authenticated `GET /books` queries the `LISTED` index.
3. **Sell:** authenticated `POST /books` validates the request and sets `sellerId` from the JWT subject.
4. **Buy:** authenticated `POST /books/{bookId}/checkout` atomically changes a listed book to sold and creates an order. DynamoDB conditions prevent buying one's own book or placing multiple successful orders for the same listing.
5. **Account views:** `GET /me/listings` and `GET /me/orders` use the authenticated member ID as the index partition key.
6. **Order receipt:** an order INSERT in the Orders table emits a DynamoDB Stream record; the receipt Lambda transforms the new image to a minimal JSON receipt and writes it to `invoices/{orderId}.json` in S3. Stream delivery may be repeated; deterministic keys overwrite the current object, but S3 versioning can retain duplicate object versions. There is no user-facing retrieval route.
7. **Proposed payment test flow:** the authenticated backend would validate the listing and derive the amount from its stored price, create a Stripe test-mode Checkout Session, and return only the hosted Checkout URL to the browser. Stripe would send a signed event to a dedicated webhook route; the backend would verify the signature and process the event idempotently before marking the order paid. A success redirect alone must never mark an order paid. This flow is not implemented.

## Assets and abuse cases to explore

- **Account takeover:** stolen password, weak recovery flow, token theft, and prolonged browser sessions.
- **Broken object-level authorization:** changing a book or member identifier to access another reader's records.
- **Marketplace integrity:** price tampering, duplicate checkout, buying one's own listing, invalid listing content, and automated listing abuse.
- **Asynchronous receipt processing:** malformed or unexpectedly large stream records, duplicate/retried processing, poison records blocking a batch, excess S3 versions from retries, and accidental exposure or overwrite of receipt objects.
- **Payment integrity (proposed):** forged or replayed webhook events, duplicate event processing, trusting a client-supplied price or success redirect, mismatched order references, stale Checkout Sessions, and test/live mode or key confusion.
- **Third-party dependency (proposed):** Stripe API outage or compromise, unexpected webhook payloads, exposure or rotation of API/webhook secrets, and accidental use of live credentials during testing.
- **Sensitive data exposure:** excessive API responses, logs containing tokens, or overly broad database access.
- **Availability and cost:** unbounded traffic, repeated searches, or high-volume account creation.
- **Supply-chain and operator risk:** compromised browser code, Lambda code, or deployment credentials.
- **Trust in the user and seller:** misleading descriptions and off-platform communication are not addressed by this prototype.

## Deliberate prototype limits

- Checkout records a `PLACED` order only. It does not integrate a payment processor, handle refunds, provide shipping, or issue tax/payment invoices.
- The Orders table stream triggers a dedicated receipt Lambda that writes a minimal JSON order receipt to the private, encrypted, versioned S3 bucket. Stream processing and S3 writes are not transactionally coupled to checkout; stream delivery is at least once and retry writes may create additional S3 object versions. No receipt download API route exists.
- The Stripe boundary and payment flow in this document are a test-mode design for threat modeling only; there is no Stripe SDK, credential, API route, or live payment integration in the app.
- A future webhook endpoint must be exempted from the API's default Cognito JWT authorizer and instead authenticate events using Stripe signature verification. Do not disable authorization on existing member routes.
- The browser's demo mode uses local storage and simulated sign-in. It is for UI exploration only and is not an authentication or persistence control.
- The browser assets are served locally in this sample; production hosting, custom domain, TLS configuration, and content security policy need a deliberate deployment design.
- Rate limiting, moderation, audit logging, alarms, and operational response procedures are not configured.
