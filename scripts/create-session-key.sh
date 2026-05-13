#!/bin/bash
#
# CREATE SESSION KEY
#
# Creates and authorizes a new session key for use with Synapse SDK.
# Session keys allow delegated access without exposing your main private key.
#
# USAGE:
#   PRIVATE_KEY=0x... ./create-session.sh [VALIDITY_DAYS]
#
# ARGUMENTS:
#   VALIDITY_DAYS  Number of days the session key should be valid (default: 10)
#
# ENVIRONMENT VARIABLES:
#   PRIVATE_KEY    Your main wallet's private key (required)
#
# EXAMPLES:
#   # Create a session key valid for 10 days (default)
#   PRIVATE_KEY=0xabc123... ./create-session.sh
#
#   # Create a session key valid for 30 days
#   PRIVATE_KEY=0xabc123... ./create-session.sh 30
#
# OUTPUT:
#   The script outputs environment variables to add to your .env file:
#   - VITE_WALLET_ADDRESS: Your main wallet address
#   - VITE_SESSION_KEY: The generated session key private key
#
# PERMISSIONS GRANTED:
#   - CREATE_DATA_SET: Create new datasets
#   - ADD_PIECES: Add data pieces to datasets
#
# SECURITY NOTE:
#   Keep the session key secure. If compromised, revoke it immediately
#   using ./revoke-session.sh
#
# NOTE (registry address):
#   The session key registry address is resolved from the Warm Storage contract
#   (same as the website/SDK). If contracts are upgraded, re-run this script to
#   create a new session key; the script will use the current registry.
#
set -e

# Configuration
# These must match the addresses/typehashes used by @filoz/synapse-sdk (Warm Storage → sessionKeyRegistry, EIP712_TYPE_HASHES)
VALIDITY_DAYS="${1:-10}"  # Default to 10 days, override with first argument
RPC_URL="${VITE_FILECOIN_RPC_URL:-https://api.calibration.node.glif.io/rpc/v1}"
# Warm Storage on calibration - SDK uses this to resolve sessionKeyRegistry()
WARM_STORAGE_CALIBRATION="0x02925630df557F957f70E112bA06e50965417CA0"
# sessionKeyRegistry() selector (keccak256 "sessionKeyRegistry()" truncated to 4 bytes)
SESSION_KEY_REGISTRY_SELECTOR="0x9f6aa572"
# EIP-712 type hashes from @filoz/synapse-sdk (CreateDataSet, AddPieces) - used as permission identifiers
CREATE_DATA_SET_TYPEHASH="0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9"
ADD_PIECES_TYPEHASH="0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183"

# Check required env var
if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY environment variable is required" >&2
    exit 1
fi

echo "Step 1: Generating new session key..."
# Generate new session key
SESSION_KEY_OUTPUT=$(cast wallet new)
SESSION_KEY_ADDRESS=$(echo "$SESSION_KEY_OUTPUT" | grep "Address:" | awk '{print $2}')
SESSION_KEY_PRIVATE=$(echo "$SESSION_KEY_OUTPUT" | grep "Private key:" | awk '{print $3}')
echo "  Session key address: $SESSION_KEY_ADDRESS"
echo "  Session key private: ${SESSION_KEY_PRIVATE:0:20}..."

echo "Step 2: Calculating expiry timestamp..."
# Calculate expiry timestamp
CURRENT_TIME=$(date +%s)
EXPIRY=$((CURRENT_TIME + VALIDITY_DAYS * 24 * 60 * 60))
echo "  Expiry: $(date -r $EXPIRY '+%Y-%m-%d %H:%M:%S')"

echo "Step 3: Getting owner address from private key..."
# Get owner address
OWNER_ADDRESS=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "  Owner address: $OWNER_ADDRESS"

echo "Step 4: Resolving session key registry from Warm Storage (must match SDK)..."
# Fetch current registry address from Warm Storage so we always authorize on the same contract the app uses
REGISTRY_RESPONSE=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WARM_STORAGE_CALIBRATION\",\"data\":\"$SESSION_KEY_REGISTRY_SELECTOR\"},\"latest\"],\"id\":1}")
REGISTRY_HEX=$(echo "$REGISTRY_RESPONSE" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
if [ -z "$REGISTRY_HEX" ] || [ "$REGISTRY_HEX" = "0x" ]; then
    echo "Error: Failed to get session key registry from Warm Storage. Check RPC_URL and network." >&2
    exit 1
fi
# Decode 32-byte left-padded address (last 40 hex chars = 20 bytes)
REGISTRY="0x${REGISTRY_HEX: -40}"
echo "  Registry: $REGISTRY"

echo "Step 5: Authorizing session key on-chain (this may take a minute)..."
echo "  RPC URL: $RPC_URL"
# login(signer, expiry, permissions, origin) - origin is required by the SessionKeyRegistry contract
ORIGIN="${SESSION_LOGIN_ORIGIN:-filecoin-pin-website}"
cast send $REGISTRY \
    "login(address,uint256,bytes32[],string)" \
    "$SESSION_KEY_ADDRESS" \
    "$EXPIRY" \
    "[$CREATE_DATA_SET_TYPEHASH,$ADD_PIECES_TYPEHASH]" \
    "$ORIGIN" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_URL"

# Output results
echo ""
echo "=========================================="
echo "Session key created successfully!"
echo "=========================================="
echo "Validity: $VALIDITY_DAYS days (expires: $(date -r $EXPIRY '+%Y-%m-%d %H:%M:%S'))"
echo ""
echo "Add these to your .env file:"
echo "------------------------------------------"
echo "VITE_WALLET_ADDRESS=$OWNER_ADDRESS"
echo "VITE_SESSION_KEY=$SESSION_KEY_PRIVATE"
echo ""
echo "Session key info (for debugging):"
echo "------------------------------------------"
echo "SESSION_KEY_ADDRESS=$SESSION_KEY_ADDRESS"
echo "OWNER_ADDRESS=$OWNER_ADDRESS"
