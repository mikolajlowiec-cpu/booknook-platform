import json
import os


def _s3_client():
    import boto3

    return boto3.client("s3")


def _attribute(image, name, kind):
    value = image.get(name, {})
    if kind not in value:
        raise ValueError(f"Order stream record is missing {name}")
    return value[kind]


def _receipt(image):
    return {
        "documentType": "order-receipt",
        "orderId": _attribute(image, "orderId", "S"),
        "bookId": _attribute(image, "bookId", "S"),
        "title": _attribute(image, "title", "S"),
        "priceCents": int(_attribute(image, "priceCents", "N")),
        "status": _attribute(image, "status", "S"),
        "createdAt": _attribute(image, "createdAt", "S"),
    }


def handler(event, context):
    bucket = os.environ["INVOICES_BUCKET"]
    s3 = _s3_client()

    for record in event.get("Records", []):
        if record.get("eventName") != "INSERT":
            continue

        image = record.get("dynamodb", {}).get("NewImage")
        if not image:
            raise ValueError("Order insert stream record has no NewImage")

        receipt = _receipt(image)
        s3.put_object(
            Bucket=bucket,
            Key=f"invoices/{receipt['orderId']}.json",
            Body=json.dumps(receipt, separators=(",", ":")).encode("utf-8"),
            ContentType="application/json",
            ServerSideEncryption="AES256",
        )

    return {"processed": True}
