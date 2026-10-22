#!/usr/bin/env python3
"""
nextbiz-one — Postgres daily backup → Cloudflare R2.

Mirrors the proven NBS pattern (scripts/db-backup.py, technical-plan §4/D5):
- pg_dump (custom format = compressed + restorable) from the nextbiz_one_db
  docker container
- uploads to R2 bucket `joyverse-db-backups` (private) via the S3-compatible
  API (r-nbo-s0 naming; env-overridable — plan §4 draft said `joyverse-backups`)
- 30-day retention, self-pruning

Key layout: nextbiz-one/db/daily/nextbiz-one-<UTC stamp>.dump
Runs from cron on the VM. A backup never restore-tested is not a backup —
the monthly restore drill pairs with this (scratch container → restore →
row counts + checksum verify).
"""
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.client import Config as BotoConfig

CREDS_FILE = Path.home() / ".hermes/profiles/mira/.env.cloudflare-r2"
BUCKET = os.environ.get("NBO_BACKUP_BUCKET", "joyverse-db-backups")
CONTAINER = "nextbiz_one_db"
PG_USER = "nextbiz"
PG_DB = "nextbiz_one"
KEEP_DAYS = 30


def load_creds() -> dict:
    creds = {}
    with open(CREDS_FILE) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                creds[k.strip()] = v.strip().strip('"').strip("'")
    return creds


def main() -> int:
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%dT%H%M%SZ")
    fname = f"nextbiz-one-{stamp}.dump"
    tmp = Path(f"/tmp/{fname}")

    print(f"[nbo-backup] dumping {PG_DB} from {CONTAINER} …")
    with open(tmp, "wb") as out:
        rc = subprocess.call(
            ["docker", "exec", CONTAINER, "pg_dump", "-U", PG_USER, "-d", PG_DB, "-Fc"],
            stdout=out,
        )
    if rc != 0:
        print("[nbo-backup] FAILED: pg_dump exited non-zero", file=sys.stderr)
        return 1
    print(f"[nbo-backup] dump ok: {fname} ({tmp.stat().st_size} bytes)")

    creds = load_creds()
    s3 = boto3.client(
        "s3",
        endpoint_url=creds["R2_S3_ENDPOINT"],
        aws_access_key_id=creds["CLOUDFLARE_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=creds["CLOUDFLARE_R2_SECRET_ACCESS_KEY"],
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )
    try:
        s3.head_bucket(Bucket=BUCKET)
    except Exception:
        s3.create_bucket(Bucket=BUCKET)
        print(f"[nbo-backup] created bucket {BUCKET}")

    key = f"nextbiz-one/db/daily/{fname}"
    s3.upload_file(str(tmp), BUCKET, key)
    print(f"[nbo-backup] uploaded s3://{BUCKET}/{key}")

    cutoff = (now - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT")
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix="nextbiz-one/db/daily/")
    for o in resp.get("Contents", []):
        if o["Key"] < f"nextbiz-one/db/daily/nextbiz-one-{cutoff}":
            s3.delete_object(Bucket=BUCKET, Key=o["Key"])
            print(f"[nbo-backup] pruned {o['Key']}")

    tmp.unlink(missing_ok=True)
    print("[nbo-backup] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
