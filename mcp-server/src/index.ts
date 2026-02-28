import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import startServer from "./server/server.js";
import { Client as XrplClient, Wallet } from "xrpl";
import { DEFAULT_SEED } from "./core/constants.js";
import { getXrplClient } from "./core/services/clients.js";
import { setConnectedWallet } from "./core/state.js";

// Import tool files to register them
import "./transactions/connect.js";
import "./transactions/transfer.js";
import "./transactions/deleteAccount.js";
import "./transactions/setAccountProperties.js";
import "./transactions/getAccountInfo.js";
import "./transactions/depositPreauth.js";
import "./transactions/setRegularKey.js";
import "./transactions/token/metadata.js";
import "./transactions/token/balance.js";
import "./transactions/token/transfer.js";
import "./transactions/token/approve.js";
import "./transactions/token/clawback.js";
import "./transactions/nft/metadata.js";
import "./transactions/nft/verifyOwnership.js";
import "./transactions/nft/transfer.js";
import "./transactions/nft/collection.js";
import "./transactions/nft/mint.js";
import "./transactions/did/create.js";
import "./transactions/did/resolve.js";
import "./transactions/did/update.js";
import "./transactions/did/deactivate.js";
import "./transactions/amm/bid.js";
import "./transactions/amm/create.js";
import "./transactions/amm/deposit.js";
import "./transactions/amm/delete.js";
import "./transactions/amm/vote.js";
import "./transactions/amm/clawback.js";
import "./transactions/check/cancel.js";
import "./transactions/check/cash.js";
import "./transactions/check/create.js";
import "./transactions/offer/cancel.js";
import "./transactions/offer/create.js";
import "./transactions/oracle/delete.js";
import "./transactions/oracle/set.js";
import "./transactions/payment/channelClaim.js";
import "./transactions/payment/channelCreate.js";
import "./transactions/payment/channelFund.js";
import "./transactions/payment/payment.js";
import "./transactions/escrow/cancel.js";
import "./transactions/escrow/create.js";
import "./transactions/escrow/finish.js";
import "./transactions/escrow/tokenCreate.js";
import "./transactions/trust/setTrustline.js";
import "./transactions/ticketCreate.js";

// New XRPL Amendment Features
// Multi-Purpose Tokens (MPT) - MPTokensV1 amendment
import "./transactions/mpt/issuanceCreate.js";
import "./transactions/mpt/issuanceSet.js";
import "./transactions/mpt/issuanceDestroy.js";
import "./transactions/mpt/authorize.js";
import "./transactions/mpt/getInfo.js";

// Credentials - Credentials amendment
import "./transactions/credentials/create.js";
import "./transactions/credentials/accept.js";
import "./transactions/credentials/delete.js";
import "./transactions/credentials/getInfo.js";

// Permissioned Domains - PermissionedDomains amendment
import "./transactions/permissioned-domains/set.js";
import "./transactions/permissioned-domains/delete.js";
import "./transactions/permissioned-domains/getInfo.js";

// Batch Transactions - BatchTransactions amendment
import "./transactions/batch/submit.js";

// Dynamic NFT - DynamicNFT amendment
import "./transactions/nft/modify.js";

// Permission Delegation - PermissionDelegation amendment
import "./transactions/delegation/set.js";

// Function to automatically connect to XRPL using the seed from .env
async function connectToXrpl() {
    if (!DEFAULT_SEED) {
        console.error(
            "No XRPL_SEED found in .env file, skipping automatic connection"
        );
        return;
    }

    let client = null;
    try {
        // Validate seed format before attempting connection
        let wallet;
        try {
            wallet = Wallet.fromSeed(DEFAULT_SEED);
        } catch (seedError) {
            console.error("Invalid seed format in .env:", seedError);
            return;
        }

        // Connect only to testnet
        try {
            console.error("Connecting to XRPL testnet...");
            client = await getXrplClient(true); // true = testnet

            // Store the connected wallet
            setConnectedWallet(wallet, true);

            // Fetch account info
            const accountInfo = await client.request({
                command: "account_info",
                account: wallet.address,
                ledger_index: "validated",
            });

            console.error(
                `Successfully connected to XRPL testnet with wallet: ${wallet.address}`
            );
            console.error(
                `Wallet balance: ${accountInfo.result.account_data.Balance} drops`
            );
        } catch (testnetError) {
            console.error("Testnet connection failed:", testnetError);
            console.error(
                "The account may not exist on testnet or may not be funded"
            );
            console.error(
                "Consider creating a new wallet using the connect-to-xrpl tool with useSeedFromEnv=false"
            );

            // Clean up testnet connection
            if (client) {
                try {
                    await client.disconnect();
                    client = null;
                } catch (disconnectError) {
                    console.error(
                        "Error disconnecting from testnet:",
                        disconnectError
                    );
                }
            }
        }
    } catch (error) {
        console.error("Error automatically connecting to XRPL:", error);
    } finally {
        // Clean up connection if still open and there was an error
        if (client && client.isConnected()) {
            try {
                await client.disconnect();
            } catch (disconnectError) {
                console.error(
                    "Error disconnecting from XRPL:",
                    disconnectError
                );
            }
        }
    }
}

// Start the server
async function main() {
    try {
        console.error("Starting XRPL MCP Server...");
        const server = await startServer();

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("XRPL MCP Server running on stdio");

        // Handle cleanup
        process.on("SIGINT", async () => {
            console.error("Shutting down...");
            await server.close();
            process.exit(0);
        });

        // Automatically connect to XRPL network
        await connectToXrpl();
    } catch (error) {
        console.error("Error starting MCP server:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
