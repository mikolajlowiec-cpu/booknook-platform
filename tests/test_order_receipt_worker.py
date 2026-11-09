import json
import os
import unittest
from unittest.mock import patch

from src import order_receipt_worker


class FakeS3:
    def __init__(self):
        self.objects = []

    def put_object(self, **kwargs):
        self.objects.append(kwargs)


def order_record(event_name="INSERT", order_id="order-1"):
    return {
        "eventName": event_name,
        "dynamodb": {
            "NewImage": {
                "orderId": {"S": order_id},
                "bookId": {"S": "book-1"},
                "title": {"S": "Sample Book"},
                "priceCents": {"N": "850"},
                "status": {"S": "PLACED"},
                "createdAt": {"S": "2026-11-09T12:00:00+00:00"},
            }
        },
    }


class OrderReceiptWorkerTests(unittest.TestCase):
    def test_order_insert_writes_minimal_receipt_to_private_bucket(self):
        s3 = FakeS3()
        with (
            patch.dict(os.environ, {"INVOICES_BUCKET": "booknook-invoices"}),
            patch("src.order_receipt_worker._s3_client", return_value=s3),
        ):
            result = order_receipt_worker.handler({"Records": [order_record()]}, None)

        self.assertEqual(result, {"processed": True})
        self.assertEqual(len(s3.objects), 1)
        stored = s3.objects[0]
        self.assertEqual(stored["Bucket"], "booknook-invoices")
        self.assertEqual(stored["Key"], "invoices/order-1.json")
        self.assertEqual(stored["ContentType"], "application/json")
        self.assertEqual(stored["ServerSideEncryption"], "AES256")
        receipt = json.loads(stored["Body"])
        self.assertEqual(receipt["documentType"], "order-receipt")
        self.assertEqual(receipt["priceCents"], 850)
        self.assertNotIn("buyerId", receipt)
        self.assertNotIn("sellerId", receipt)

    def test_non_insert_stream_records_are_ignored(self):
        s3 = FakeS3()
        with (
            patch.dict(os.environ, {"INVOICES_BUCKET": "booknook-invoices"}),
            patch("src.order_receipt_worker._s3_client", return_value=s3),
        ):
            order_receipt_worker.handler({"Records": [order_record("MODIFY")]}, None)

        self.assertEqual(s3.objects, [])


if __name__ == "__main__":
    unittest.main()
