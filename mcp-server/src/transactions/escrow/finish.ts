import { Client, Wallet, EscrowFinish } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register escrow-finish tool
server.registerTool(
    "escrow-finish",
    {
        title: "Finish Escrow",
        description: "Finish an Escrow on the XRP Ledger, releasing funds to the recipient",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet executing the finish. If not provided, the connected wallet will be used."
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
            condition: z
                .string()
                .optional()
                .describe(
                    "Hex value matching the one supplied in EscrowCreate (if conditional escrow)."
                ),
            fulfillment: z
                .string()
                .optional()
                .describe(
                    "Hex value of the PREIMAGE-SHA-256 fulfillment matching the condition (if conditional escrow)."
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
        owner,
        offerSequence,
        condition,
        fulfillment,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Check if condition and fulfillment are provided together if needed
            if (condition && !fulfillment) {
                throw new Error(
                    "Fulfillment must be provided if condition is specified."
                );
            }
            if (!condition && fulfillment) {
                throw new Error(
                    "Condition must be provided if fulfillment is specified."
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

            // Create EscrowFinish transaction
            const escrowFinishTx: EscrowFinish = {
                TransactionType: "EscrowFinish",
                Account: wallet.address, // The account executing the finish
                Owner: owner, // The creator of the escrow
                OfferSequence: offerSequence, // Sequence of the EscrowCreate tx
            };

            // Add conditional fields if provided
            if (condition) {
                escrowFinishTx.Condition = condition;
            }
            if (fulfillment) {
                escrowFinishTx.Fulfillment = fulfillment;
            }

            // Add optional fee if provided
            if (fee) {
                escrowFinishTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(escrowFinishTx);
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
                                finishingAccount: wallet.address,
                                escrowOwner: owner,
                                offerSequence,
                                conditionProvided: !!condition,
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
                        text: `Error finishing Escrow: ${
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
