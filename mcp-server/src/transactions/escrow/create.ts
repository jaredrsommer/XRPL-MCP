import { Client, Wallet, EscrowCreate } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register escrow-create tool
server.registerTool(
    "escrow-create",
    {
        title: "Create Escrow",
        description: "Create an Escrow on the XRP Ledger to hold funds until a condition is met or time passes",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (sender) to use. If not provided, the connected wallet will be used."
                ),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to hold in escrow"),
            destination: z
                .string()
                .describe("Address of the recipient of the escrowed funds"),
            destinationTag: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional arbitrary unsigned 32-bit integer tag for the destination."
                ),
            condition: z
                .string()
                .optional()
                .describe(
                    "Hex value representing a PREIMAGE-SHA-256 crypto-condition. If provided, escrow can only be finished with the preimage."
                ),
            finishAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be finished."
                ),
            cancelAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be cancelled."
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
    },
    async ({
        fromSeed,
        amount,
        destination,
        destinationTag,
        condition,
        finishAfter,
        cancelAfter,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Ensure at least one release condition is specified
            if (!condition && !finishAfter) {
                throw new Error(
                    "Either condition or finishAfter must be specified for the escrow."
                );
            }

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

            // Create EscrowCreate transaction
            const escrowCreateTx: EscrowCreate = {
                TransactionType: "EscrowCreate",
                Account: wallet.address,
                Amount: amount, // Amount in drops
                Destination: destination,
            };

            // Add optional fields
            if (destinationTag) {
                escrowCreateTx.DestinationTag = destinationTag;
            }
            if (condition) {
                escrowCreateTx.Condition = condition;
            }
            if (finishAfter) {
                escrowCreateTx.FinishAfter = finishAfter;
            }
            if (cancelAfter) {
                escrowCreateTx.CancelAfter = cancelAfter;
            }
            if (fee) {
                escrowCreateTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(escrowCreateTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let offerSequence = -1;
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
                // Extract OfferSequence from metadata if successful
                if (status === "success" && result.result.meta.AffectedNodes) {
                    for (const node of result.result.meta.AffectedNodes) {
                        if (
                            "CreatedNode" in node &&
                            node.CreatedNode?.LedgerEntryType === "Escrow"
                        ) {
                            offerSequence = (node.CreatedNode.NewFields as any)
                                ?.Sequence;
                            break;
                        }
                    }
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                offerSequence:
                                    status === "success" && offerSequence !== -1
                                        ? offerSequence
                                        : "N/A",
                                account: wallet.address,
                                amount,
                                destination,
                                condition,
                                finishAfter,
                                cancelAfter,
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
                        text: `Error creating Escrow: ${
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
