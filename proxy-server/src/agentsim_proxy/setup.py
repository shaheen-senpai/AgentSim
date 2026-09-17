"""Generates everything the agent needs to route through agentsim-proxy via plain
process env vars: the mitmproxy CA certificate, and a combined CA bundle (real
public CAs + the mitmproxy CA) for `SSL_CERT_FILE`.

The combined bundle matters: pointing `SSL_CERT_FILE` at the mitmproxy CA *alone*
replaces the whole trust store process-wide, breaking any other real HTTPS
connection in that process (e.g. the agent's OpenAI calls) with
CERTIFICATE_VERIFY_FAILED. This bundle trusts both: the mitmproxy CA for the
intercepted gmailmcp.googleapis.com traffic, and the real public CAs for
everything else.

This does NOT start the mitmdump process — that still runs as its own process
(see README). Run this once (`uv run agentsim-proxy-setup --port 8090`) and it
prints ready-to-paste `export ...` lines for the agent's `.env`.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import certifi
from mitmproxy.certs import CertStore

_DEFAULT_CONFDIR = Path("~/.mitmproxy").expanduser()
_CA_BASENAME = "mitmproxy"
_COMBINED_BUNDLE_NAME = "agentsim-combined-ca-bundle.pem"


@dataclass(frozen=True)
class ProxyConnectionInfo:
    proxy_url: str
    ca_cert_path: Path  # combined bundle: real public CAs + the mitmproxy CA


def setup_proxy(host: str = "127.0.0.1", port: int = 8090, confdir: str | Path = _DEFAULT_CONFDIR) -> ProxyConnectionInfo:
    confdir = Path(confdir).expanduser()
    confdir.mkdir(parents=True, exist_ok=True)

    CertStore.from_store(confdir, _CA_BASENAME, key_size=2048)
    mitm_ca_path = confdir / f"{_CA_BASENAME}-ca-cert.pem"

    combined_path = confdir / _COMBINED_BUNDLE_NAME
    combined_path.write_text(Path(certifi.where()).read_text() + mitm_ca_path.read_text())

    return ProxyConnectionInfo(proxy_url=f"http://{host}:{port}", ca_cert_path=combined_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="agentsim-proxy setup: generate CA + combined bundle")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument(
        "--format",
        choices=["env", "json"],
        default="env",
        help="'env' (default) prints ready-to-paste export lines; 'json' prints machine-readable output",
    )
    args = parser.parse_args()

    info = setup_proxy(host=args.host, port=args.port)
    if args.format == "json":
        print(json.dumps({"proxy_url": info.proxy_url, "ca_cert_path": str(info.ca_cert_path)}))
    else:
        print(f"export HTTPS_PROXY={info.proxy_url}")
        print("export NO_PROXY=api.openai.com")
        print(f"export SSL_CERT_FILE={info.ca_cert_path}")
        print(f"export REQUESTS_CA_BUNDLE={info.ca_cert_path}")


if __name__ == "__main__":
    main()
