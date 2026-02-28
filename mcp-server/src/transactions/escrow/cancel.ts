import { Client, Wallet, EscrowCancel } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register escrow-cancel tool
server.registerTool(
    "escrow-cancel",
    {
        title: "Cancel Escrow",
        description: "Cancel an unexecuted Escrow on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use (must be sender or receiver, or expired). If not provided, the connected wallet will be used."
                ),
            owner: z
                .string()
                .describe("Address of the account that created the escrow"),
            offerSequence: z
                .number()
                .int()
                .positive()
                .describe(
                    "Transaction sequence number of the EscrowCreate transaction that created the escrow"
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { destructiveHint: true },
    },
    async ({ fromSeed, owner, offerSequence, fee, useTestnet }) => {
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Create EscrowCancel transaction
            const escrowCancelTx: EscrowCancel = {
                TransactionType: "EscrowCancel",
                Account: wallet.address, // The account submitting the cancel tx
                Owner: owner, // The creator of the escrow
                OfferSequence: offerSequence, // The sequence number of the EscrowCreate tx
            };

            // Add optional fee if provided
            if (fee) {
                escrowCancelTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(escrowCancelTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                cancelingAccount: wallet.address,
                                escrowOwner: owner,
                                offerSequence,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error canceling Escrow: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    },
                ],
            };
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
