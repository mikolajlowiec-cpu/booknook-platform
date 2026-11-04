# BookNook system description

## Purpose and scope

BookNook is a prototype marketplace for browsing used-book listings, creating listings, and placing demo orders. It has a static browser storefront, an optional AWS-backed API, and a browser-only demo mode.

The deployed application does not take payments, arrange shipping, issue invoices, or integrate with Stripe. The AWS template provisions an S3 bucket intended for future invoices and grants the API Lambda limited object access, but the application code does not currently use the bucket. Stripe is a proposed test-mode scenario described in [the architecture notes](../architecture.md), not a runtime dependency.

The system is intended for demonstration and threat-modeling exercises, not for handling real payment or sensitive personal information.

## Deployment modes

### Browser-only demo

The default `web/config.js` has empty API and Cognito settings, so `web/app.js` selects demo mode.

- The static files can be served locally using the command in `README.md`.
- Sample books and demo listings/orders are stored in browser `localStorage`.
- Demo identity is simulated. The entered email is used to form a demo member identifier; no real authentication is performed.
- The demo member is kept in `sessionStorage`.
- Listing and checkout actions update local browser state only. No API, AWS resource, payment provider, or server-side account is involved.

### AWS-backed prototype

When configured with API and Cognito values, the browser calls the AWS API. The SAM template in `template.yaml` provisions:

- Amazon API Gateway HTTP API with a Cognito JWT authorizer as the default authorizer.
- Amazon Cognito User Pool and public browser app client (no client secret).
- One Python 3.12 Lambda function for the API.
- DynamoDB tables for listings and orders.
- A private S3 bucket reserved for invoice objects.

The browser signs up and signs in directly against Cognito. It stores the Cognito ID token and member claims in `sessionStorage`, and sends the ID token as a bearer token on API calls. The browser decodes token claims for display/state; API Gateway validates the JWT against the configured issuer and audience. The Lambda also reads the authenticated `sub` claim from the API Gateway authorizer context and rejects requests where it is missing.

The SAM template allows CORS origins `http://localhost:5500` and `http://127.0.0.1:5500`. The README's local server is a development setup; no production web hosting or domain is defined in this repository.

## Components and responsibilities

| Component | Responsibility and repository evidence |
|---|---|
| Reader's browser | Displays storefront, filters/searches books, collects listing details, starts demo checkout, and displays the member's orders/listings. `web/index.html` and `web/app.js`. |
| Browser demo storage | Stores demo listings and orders in local storage and simulated member state in session storage. `web/app.js`. |
| Amazon Cognito | In AWS mode, handles email/password sign-up, email verification, and sign-in; issues ID tokens. `template.yaml`, `web/app.js`. |
| API Gateway HTTP API | Exposes the five API routes and applies the Cognito JWT authorizer by default. `template.yaml`. |
| BookNook Lambda | Validates listing input, derives member identity from verified claims, queries DynamoDB, and performs checkout transaction. `src/app.py`, `template.yaml`. |
| BookListings DynamoDB table | Stores book listing data, including seller ID, title, author, condition, description, category, price, status, and timestamps. `template.yaml`, `src/app.py`. |
| Orders DynamoDB table | Stores order ID, buyer and seller IDs, book ID, title, price, status, and creation time. `template.yaml`, `src/app.py`. |
| Invoices S3 bucket | Private bucket with public access blocked, AES-256 server-side encryption, versioning, and a bucket policy denying insecure transport. Lambda environment receives its name and its role has `GetObject`/`PutObject` on `invoices/*`. No application code generates, reads, or writes invoice files. `template.yaml`. |
| Stripe | No runtime component. A future test-mode flow is shown as proposed in `docs/architecture.md` only. |

## API surface and authorization

All five routes are connected to the same Lambda and inherit the HTTP API's default Cognito JWT authorizer.

| Method and path | Behavior |
|---|---|
| `GET /books` | Queries listed books using the status/creation-time index; query limit is 100. |
| `POST /books` | Validates listing fields and creates a listing with seller ID from the authenticated JWT subject. |
| `GET /me/listings` | Queries listings using the authenticated member's seller ID. |
| `POST /books/{bookId}/checkout` | Loads a listed book and transactionally marks it sold and creates an order. Rejects unavailable listings and self-purchase. |
| `GET /me/orders` | Queries orders using the authenticated member's buyer ID. |

The API implementation and route behavior are in `src/app.py`; route, authorizer, and table definitions are in `template.yaml`. The function role has CRUD access to the two DynamoDB tables, transaction-write access to those tables, and S3 object read/write access scoped to the invoice prefix. It has no S3 delete permission in the template.

## Main data flows

1. **Authentication:** browser → Cognito for sign-up, verification, and sign-in. Cognito returns an ID token to the browser.
2. **Browse:** browser → API Gateway with ID token → Lambda → listings table → browser.
3. **Create listing:** browser sends listing fields and ID token → API Gateway → Lambda validates fields and sets seller ID from verified claims → listings table.
4. **Checkout:** browser requests checkout with ID token → Lambda reads listing → DynamoDB transaction changes listing status and inserts an order → response returns order metadata to browser.
5. **Account views:** browser requests own listings or orders with ID token → Lambda scopes the DynamoDB query to the member ID from verified claims → browser.
6. **Invoice storage (future use):** the bucket and constrained Lambda permissions exist, but no current application data flow reaches S3.
7. **Payment (future exercise):** a test-mode Stripe flow is proposed in `docs/architecture.md`; there is no Stripe API, webhook endpoint, credential, or payment status in the current implementation.

## Data to consider

| Data | Current location/handling | Threat-modeling relevance |
|---|---|---|
| Email address and password | Entered in the browser and sent to Cognito in AWS mode; demo mode uses a simulated identity. Passwords are not stored by the BookNook API. | Account compromise, credential exposure, abuse of registration/sign-in. |
| Cognito ID token and member claims | ID token is held in browser session storage; token is sent to API Gateway. | Theft or misuse of bearer credentials; client-controlled browser environment. |
| Listing details | Browser and BookListings table in AWS mode; local storage in demo mode. Includes user-provided text and price. | Integrity, unauthorized modification, content handling, data exposure. |
| Member identifiers | Cognito subject in AWS mode; simulated string in demo mode; used as seller/buyer keys. | Authorization and cross-member data isolation. |
| Order data | Orders table in AWS mode; local storage in demo mode. Current order status is `PLACED`. | Transaction integrity, privacy, duplicate/incorrect order concerns. |
| Invoice objects | Not generated or stored by the running application. S3 bucket exists for future use. | Future confidentiality, authorization, retention, and access-path requirements. |
| Payment data | Not collected or processed by BookNook. | Stripe/card-data threats apply only if the proposed payment extension is implemented. |

## Trust boundaries

1. **Reader-controlled device ↔ BookNook browser code:** browser state and user input are controlled by the reader; demo mode has no server-side trust enforcement.
2. **Browser ↔ Cognito:** sign-up/sign-in and ID-token issuance in AWS mode.
3. **Browser ↔ API Gateway:** requests and bearer token cross a network boundary; HTTP API JWT authorizer validates the token.
4. **API Gateway ↔ Lambda:** Lambda receives route/request data and authorizer claims; application code uses the verified `sub` claim as member identity.
5. **Lambda ↔ DynamoDB:** backend reads/writes marketplace records under its IAM role; checkout uses a DynamoDB transaction.
6. **Lambda ↔ S3:** provisioned role allows only `GetObject` and `PutObject` below `invoices/*`; there is currently no application call or user-facing route for this boundary.
7. **BookNook ↔ Stripe:** not present in the implementation. The architecture document's dashed boundary is a proposed test-only flow and must not be interpreted as deployed.
8. **Operator/deployment ↔ AWS account:** SAM deployment and AWS credentials are required to provision resources. This repository does not define a CI/CD workflow or operator access process.

## Security-relevant implementation facts

- Listing validation in `src/app.py` enforces maximum title/author/description/category lengths, allowed conditions, and integer price bounds. The browser also validates price and renders user-supplied listing text through HTML escaping.
- The API derives seller and buyer identity from authorizer claims rather than caller-supplied member IDs.
- Checkout uses a conditional DynamoDB transaction to prevent a sold/unavailable listing or self-purchase from becoming a successful order.
- Browser demo authentication and local storage are convenience behavior only; they are not security controls.
- The app has no payment processing, invoice generation/retrieval, delivery, rate limiting, moderation, audit pipeline, monitoring configuration, or production hosting definition evidenced here.
- S3 public-access blocking, default encryption, versioning, and TLS enforcement are configured in the SAM template. These settings do not mean invoice data is currently being written.

## Threat-modeling prompts and open questions

Inspect the implementation and assess, with evidence:

- Whether all relevant routes and browser/API flows are consistently authenticated and authorized, including member-to-member data isolation.
- Token lifetime, browser token storage, XSS impact, sign-out behavior, and use of identity data in the UI.
- Input, output, and content handling for listing fields; server-side validation versus browser-only restrictions.
- Checkout concurrency, repeat requests, idempotency, and consistency between listing and order records.
- Exposure of public listings and orders through indexes/responses, and whether API responses contain more data than the UI requires.
- Availability and cost risks from API requests, account creation, and DynamoDB/S3 usage.
- AWS IAM scope and deployment configuration, including lifecycle/retention, access logging, and recovery needs for future invoice objects.
- The trust implications of introducing invoice generation or Stripe later; treat each as a design change requiring re-analysis, not as an existing flow.

Do not assume a threat is mitigated just because this document lists an intended control. Confirm the control in source or infrastructure. Record unresolved deployment/environment questions separately from code findings.
