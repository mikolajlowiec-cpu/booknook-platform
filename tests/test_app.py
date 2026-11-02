import json
import os
import unittest
from unittest.mock import patch

from src import app


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)

    def query(self, **kwargs):
        self.query_args = kwargs
        return {"Items": self.items}


class FakeTransactionClient:
    class exceptions:
        class TransactionCanceledException(Exception):
            pass

    def __init__(self, fail=False):
        self.fail = fail

    def get_item(self, **kwargs):
        return {
            "Item": {
                "sellerId": {"S": "seller-1"},
                "title": {"S": "Sample Book"},
                "priceCents": {"N": "850"},
                "status": {"S": "LISTED"},
            }
        }

    def transact_write_items(self, **kwargs):
        self.request = kwargs
        if self.fail:
            raise self.exceptions.TransactionCanceledException()


def api_event(method, path, body=None, path_parameters=None, member_id="member-1"):
    return {
        "rawPath": path,
        "requestContext": {
            "http": {"method": method},
            "authorizer": {"jwt": {"claims": {"sub": member_id}}},
        },
        "pathParameters": path_parameters,
        "body": body,
    }


class MarketplaceTests(unittest.TestCase):
    def setUp(self):
        self.books = FakeTable()
        self.orders = FakeTable()
        self.book_patch = patch("src.app._books_table", return_value=self.books)
        self.order_patch = patch("src.app._orders_table", return_value=self.orders)
        self.query_patch = patch("src.app._query", side_effect=lambda table, *args: table.query())
        self.book_patch.start()
        self.order_patch.start()
        self.query_patch.start()
        self.addCleanup(self.book_patch.stop)
        self.addCleanup(self.order_patch.stop)
        self.addCleanup(self.query_patch.stop)
        self.environment = patch.dict(
            os.environ,
            {"BOOKS_TABLE": "BookListings", "ORDERS_TABLE": "Orders"},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_create_listing_uses_authenticated_member_as_seller(self):
        response = app.handler(
            api_event(
                "POST",
                "/books",
                json.dumps(
                    {
                        "title": "The Hobbit",
                        "author": "J. R. R. Tolkien",
                        "condition": "Good",
                        "priceCents": 850,
                    }
                ),
            ),
            None,
        )
        book = json.loads(response["body"])["book"]
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(book["sellerId"], "member-1")
        self.assertEqual(book["status"], "LISTED")

    def test_rejects_malformed_and_invalid_listings(self):
        malformed = app.handler(api_event("POST", "/books", "{"), None)
        invalid = app.handler(
            api_event(
                "POST",
                "/books",
                json.dumps(
                    {
                        "title": "Book",
                        "author": "Author",
                        "condition": "New-ish",
                        "priceCents": 100,
                    }
                ),
            ),
            None,
        )
        invalid_condition_type = app.handler(
            api_event(
                "POST",
                "/books",
                json.dumps(
                    {
                        "title": "Book",
                        "author": "Author",
                        "condition": [],
                        "priceCents": 100,
                    }
                ),
            ),
            None,
        )
        self.assertEqual(malformed["statusCode"], 400)
        self.assertEqual(invalid["statusCode"], 400)
        self.assertEqual(invalid_condition_type["statusCode"], 400)

    def test_checkout_is_atomic_and_rejects_unavailable_book(self):
        client = FakeTransactionClient()
        with patch("src.app._dynamodb_client", return_value=client):
            response = app.handler(
                api_event("POST", "/books/book-1/checkout", path_parameters={"bookId": "book-1"}),
                None,
            )
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(len(client.request["TransactItems"]), 2)
        self.assertIn("sellerId <> :buyerId", client.request["TransactItems"][0]["Update"]["ConditionExpression"])

        client = FakeTransactionClient(fail=True)
        with patch("src.app._dynamodb_client", return_value=client):
            conflict = app.handler(
                api_event("POST", "/books/book-1/checkout", path_parameters={"bookId": "book-1"}),
                None,
            )
        self.assertEqual(conflict["statusCode"], 409)

    def test_rejects_missing_identity(self):
        response = app.handler({"requestContext": {"http": {"method": "GET"}}}, None)
        self.assertEqual(response["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()
