import os
import boto3
from botocore.config import Config
from urllib.parse import urlparse

def presign_s3_url(key_or_url: str, expires_in: int = 900) -> str:
    """
    Generate a short-lived presigned GET URL for an S3 object key.
    expires_in defaults to 15 minutes (900 seconds) for security.
    """
    if not key_or_url:
        return key_or_url
        
    bucket = os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION") or "ap-south-1"
    
    # Handle backward compatibility if it's already a full URL
    if key_or_url.startswith("http"):
        if "amazonaws.com" not in key_or_url:
            return key_or_url
        parsed = urlparse(key_or_url)
        path = parsed.path.lstrip("/")
        if ".s3." in parsed.netloc:
            bucket = parsed.netloc.split(".s3.")[0]
            region = parsed.netloc.split(".s3.")[1].split(".amazonaws.com")[0]
        else:
            bucket = parsed.netloc.split(".s3-control.")[0] if ".s3-control." in parsed.netloc else os.getenv("S3_BUCKET")
    else:
        path = key_or_url.lstrip("/")

    if not bucket or not path:
        return key_or_url

    try:
        client_kwargs = {
            "service_name": "s3",
            "region_name": region,
            "config": Config(signature_version="s3v4")
        }
        if os.getenv("PIKA_AWS_ACCESS_KEY_ID"):
            client_kwargs["aws_access_key_id"] = os.getenv("PIKA_AWS_ACCESS_KEY_ID")
            client_kwargs["aws_secret_access_key"] = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY")
            
        s3_client = boto3.client(**client_kwargs)
        
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": path},
            ExpiresIn=expires_in,
        )
        return presigned_url
    except Exception as e:
        print(f"Failed to generate presigned GET URL for {path}: {e}")
        return key_or_url

def generate_presigned_upload_url(object_key: str, content_type: str, expires_in: int = 900) -> str:
    """
    Generate a short-lived presigned PUT URL for uploading an object to S3.
    """
    bucket = os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION") or "ap-south-1"

    if not bucket:
        raise Exception("S3_BUCKET environment variable is not set")

    try:
        client_kwargs = {
            "service_name": "s3",
            "region_name": region,
            "config": Config(signature_version="s3v4")
        }
        if os.getenv("PIKA_AWS_ACCESS_KEY_ID"):
            client_kwargs["aws_access_key_id"] = os.getenv("PIKA_AWS_ACCESS_KEY_ID")
            client_kwargs["aws_secret_access_key"] = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY")
            
        s3_client = boto3.client(**client_kwargs)
        
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": object_key,
                "ContentType": content_type
            },
            ExpiresIn=expires_in,
        )
        return presigned_url
    except Exception as e:
        print(f"Failed to generate presigned PUT URL for {object_key}: {e}")
        raise e

