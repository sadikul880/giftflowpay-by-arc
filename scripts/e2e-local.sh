#!/usr/bin/env bash
# End-to-end test on a throwaway local chain: starts Anvil in Docker, deploys a fake six-decimal USDC and GiftFlow,
# runs contracts/test-integration/local-chain.test.ts against them, then stops Anvil. No testnet funds are used.
set -euo pipefail

NAME=giftflow-anvil
IMAGE=ghcr.io/foundry-rs/foundry:v1.7.1
# Anvil's public dev key #0 (fake ETH on a local chain only).
DEV_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PROJECT="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -p 8545:8545 -v "$PROJECT:/app" -w /app --entrypoint anvil "$IMAGE" --host 0.0.0.0 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  if curl -s -m 2 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null; then break; fi
  sleep 1
done

docker exec "$NAME" forge script contracts/script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast --private-key "$DEV_KEY" 2>&1 | tail -5
bun test contracts/test-integration/local-chain.test.ts
