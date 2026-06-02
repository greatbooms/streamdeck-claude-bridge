import os
from bridge.server import run

if __name__ == "__main__":
    run(port=int(os.environ.get("BRIDGE_PORT", "8787")))
