import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4


MAX_PRICE_CENTS = 10_000_000
MAX_DESCRIPTION_LENGTH = 2_000
MAX_TITLE_LENGTH = 160
MAX_AUTHOR_LENGTH = 120
ALLOWED_CONDITIONS = {"Like new", "Very good", "Good", "Acceptable"}


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, default=_json_default),
    }


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _owner_id(event):
    try:
        return event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return None


def _books_table():
    import boto3

    return boto3.resource("dynamodb").Table(os.environ["BOOKS_TABLE"])


def _orders_table():
    import boto3

    return boto3.resource("dynamodb").Table(os.environ["ORDERS_TABLE"])


def _dynamodb_client():
    import boto3

    return boto3.client("dynamodb")


def _request_body(event):
    try:
        body = json.loads(event.get("body") or "")
    except (json.JSONDecodeError, TypeError):
        return None
    return body if isinstance(body, dict) else None


def _valid_text(value, maximum):
    return isinstance(value, str) and bool(value.strip()) and len(value.strip()) <= maximum


def _query(table, index_name, key_name, key_value):
    from boto3.dynamodb.conditions import Key

    result = table.query(
        IndexName=index_name,
        KeyConditionExpression=Key(key_name).eq(key_value),
        ScanIndexForward=False,
        Limit=100,
    )
    return result.get("Items", [])


def _create_listing(event, seller_id):
    payload = _request_body(event)
    if payload is None:
        return _response(400, {"message": "Request body must be a JSON object"})

    title = payload.get("title")
    author = payload.get("author")
    condition = payload.get("condition")
    description = payload.get("description", "")
    category = payload.get("category", "Other")
    price_cents = payload.get("priceCents")

    if not _valid_text(title, MAX_TITLE_LENGTH):
        return _response(400, {"message": "title is required and must be at most 160 characters"})
    if not _valid_text(author, MAX_AUTHOR_LENGTH):
        return _response(400, {"message": "author is required and must be at most 120 characters"})
    if not isinstance(condition, str) or condition not in ALLOWED_CONDITIONS:
        return _response(400, {"message": "condition is not supported"})
    if not isinstance(description, str) or len(description) > MAX_DESCRIPTION_LENGTH:
        return _response(400, {"message": "description must be at most 2000 characters"})
    if not _valid_text(category, 60):
        return _response(400, {"message": "category must be a non-empty string of at most 60 characters"})
    if (
        isinstance(price_cents, bool)
        or not isinstance(price_cents, int)
        or price_cents < 1
        or price_cents > MAX_PRICE_CENTS
    ):
        return _response(400, {"message": "priceCents must be an integer between 1 and 10000000"})

    book = {
        "bookId": str(uuid4()),
        "sellerId": seller_id,
        "title": title.strip(),
        "author": author.strip(),
        "condition": condition,
        "description": description.strip(),
        "category": category.strip(),
        "priceCents": price_cents,
        "status": "LISTED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    _books_table().put_item(Item=book)
    return _response(201, {"book": book})


def _checkout(book_id, buyer_id):
    if not book_id:
        return _response(400, {"message": "bookId is required"})

    order_id = str(uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    client = _dynamodb_client()
    result = client.get_item(
        TableName=os.environ["BOOKS_TABLE"],
        Key={"bookId": {"S": book_id}},
        ConsistentRead=True,
    )
    book = result.get("Item")
    if not book or book.get("status", {}).get("S") != "LISTED" or book.get("sellerId", {}).get("S") == buyer_id:
        return _response(409, {"message": "This book is unavailable or belongs to you"})

    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": os.environ["BOOKS_TABLE"],
                        "Key": {"bookId": {"S": book_id}},
                        "UpdateExpression": "SET #status = :sold, soldAt = :createdAt",
                        "ConditionExpression": "#status = :listed AND sellerId <> :buyerId",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": {
                            ":sold": {"S": "SOLD"},
                            ":listed": {"S": "LISTED"},
                            ":buyerId": {"S": buyer_id},
                            ":createdAt": {"S": created_at},
                        },
                    }
                },
                {
                    "Put": {
                        "TableName": os.environ["ORDERS_TABLE"],
                        "Item": {
                            "orderId": {"S": order_id},
                            "buyerId": {"S": buyer_id},
                            "sellerId": book["sellerId"],
                            "bookId": {"S": book_id},
                            "title": book["title"],
                            "priceCents": book["priceCents"],
                            "status": {"S": "PLACED"},
                            "createdAt": {"S": created_at},
                        },
                        "ConditionExpression": "attribute_not_exists(orderId)",
                    }
                },
            ]
        )
    except client.exceptions.TransactionCanceledException:
        return _response(409, {"message": "This book is unavailable or belongs to you"})

    return _response(
        201,
        {
            "order": {
                "orderId": order_id,
                "bookId": book_id,
                "status": "PLACED",
                "createdAt": created_at,
            }
        },
    )


def handler(event, context):
    member_id = _owner_id(event)
    if not member_id:
        return _response(401, {"message": "Unauthorized"})

    method = event.get("requestContext", {}).get("http", {}).get("method")
    path = event.get("rawPath", "")
    path_parameters = event.get("pathParameters") or {}

    if method == "GET" and path == "/books":
        books = _query(_books_table(), "StatusCreatedAtIndex", "status", "LISTED")
        return _response(200, {"books": books})

    if method == "POST" and path == "/books":
        return _create_listing(event, member_id)

    if method == "GET" and path == "/me/listings":
        books = _query(_books_table(), "SellerCreatedAtIndex", "sellerId", member_id)
        return _response(200, {"books": books})

    if method == "GET" and path == "/me/orders":
        orders = _query(_orders_table(), "BuyerCreatedAtIndex", "buyerId", member_id)
        return _response(200, {"orders": orders})

    if method == "POST" and path.endswith("/checkout"):
        return _checkout(path_parameters.get("bookId"), member_id)

    return _response(404, {"message": "Route not found"})
