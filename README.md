# BookNook

BookNook is a cozy book marketplace prototype: readers can browse books, list a used copy, and place a demo order. It is designed to be easy to run and to provide a concrete AWS system for threat-modeling exercises.

## What is included

- Responsive browser storefront with search, category filters, sample listings, account screens, and sell/buy flows.
- Local demo mode that works without AWS; it keeps demo listings and orders in browser local storage.
- AWS serverless API built with AWS SAM: API Gateway HTTP API, Cognito User Pool, Lambda, two DynamoDB tables, and a private S3 bucket provisioned for invoices.
- Member-scoped seller listings and orders, validated listing input, and atomic checkout to stop duplicate sales.
- [Architecture and threat-modeling notes](docs/architecture.md).

The checkout is a prototype: it records a demo order but does not process real payments, arrange delivery, or issue tax/payment invoices. In AWS mode, a DynamoDB Stream invokes a separate Lambda to write a minimal JSON order receipt to the private S3 bucket. The receipt is not a tax invoice, and no receipt retrieval route is provided. Do not enter real payment or sensitive personal information.

## Run the website locally

From the repository root:

```sh
python3 -m http.server 5500 --directory web
```

Open [http://localhost:5500](http://localhost:5500). Leave `web/config.js` as-is to use demo mode. Demo sign-in accepts any email and password; it is deliberately not real authentication. Demo state is stored in this browser's local storage.

## Deploy the AWS API

Prerequisites: AWS SAM CLI, AWS CLI credentials for a development account, and a configured AWS region.

```sh
sam build
sam deploy --guided
```

The deployment outputs `ApiUrl`, `UserPoolId`, `UserPoolClientId`, and `InvoicesBucketName`. Set the API and Cognito values in `web/config.js`:

```js
window.BOOKNOOK_CONFIG = {
  apiUrl: "https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com",
  userPoolId: "YOUR_REGION_YOUR_POOL_ID",
  userPoolClientId: "YOUR_PUBLIC_APP_CLIENT_ID",
};
```

Start the local web server on port `5500` after deployment. The API uses Cognito email sign-up with verification; create an account in the storefront, verify the email code, and sign in. The Cognito app client is public and has no client secret. All API routes require a valid Cognito JWT.

## API routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/books` | Browse active book listings |
| `POST` | `/books` | Create a listing for the signed-in member |
| `GET` | `/me/listings` | View the signed-in member's listings |
| `POST` | `/books/{bookId}/checkout` | Place a demo order for one available book |
| `GET` | `/me/orders` | View the signed-in member's orders |

The API identifies the seller and buyer from the validated JWT subject, never from a caller-supplied member ID. Checkout updates the listing and inserts the order in one DynamoDB transaction.

## Run tests

The unit tests use Python's standard library and do not require AWS credentials:

```sh
python3 -m unittest discover -s tests -v
```

## Threat-modeling entry point

Start with the [threat-modeling context](docs/threat-modeling/README.md) and its [system description](docs/threat-modeling/system-description.md) when using an AI threat-modeling tool. The [architecture notes](docs/architecture.md) include a component diagram, trust boundaries, data flows, assets, abuse cases, and explicit prototype limitations. They also model a proposed Stripe test-mode trust boundary for threat-modeling exercises; this is documentation only, and the app does not integrate Stripe or process payments.

This is a teaching prototype, not a production marketplace. Review the infrastructure, authentication, deployment, privacy, and operational controls before using it with real users.
