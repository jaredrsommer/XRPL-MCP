import { Client, Wallet, PaymentChannelCreate } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register payment-channel-create tool
server.registerTool(
    "payment-channel-create",
    {
        title: "Create Payment Channel",
        description: "Create a Payment Channel on the XRP Ledger for off-ledger payments",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (sender/source) creating the channel. If not provided, the connected wallet will be used."
                ),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to allocate to the channel."),
            destination: z
                .string()
                .describe("Address of the recipient (destination) of the channel."),
            settleDelay: z
                .number()
                .int()
                .positive()
                .describe(
                    "Amount of time in seconds the source address must wait after requesting to close the channel before it closes."
                ),
            publicKey: z
                .string()
                .describe(
                    "The public key of the key pair the source will use to sign claims against this channel, in hexadecimal."
                ),
            cancelAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional timestamp (seconds since Ripple Epoch) after which the channel becomes expired."
                ),
            destinationTag: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional arbitrary unsigned 32-bit integer tag for the destination."
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
        settleDelay,
        publicKey,
        cancelAfter,
        destinationTag,
        fee,
        useTestnet,
    }) => {
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

            // Create PaymentChannelCreate transaction
            const channelCreateTx: PaymentChannelCreate = {
                TransactionType: "PaymentChannelCreate",
                Account: wallet.address,
                Amount: amount, // Amount in drops (required)
                Destination: destination, // Destination address (required)
                SettleDelay: settleDelay, // Required
                PublicKey: publicKey, // Required hex public key for signing claims
            };

            // Add optional fields
            if (cancelAfter) {
                channelCreateTx.CancelAfter = cancelAfter;
            }
            if (destinationTag) {
                channelCreateTx.DestinationTag = destinationTag;
            }
            if (fee) {
                channelCreateTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(channelCreateTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let channelId = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract Channel ID (LedgerIndex) from metadata if successful
                if (status === "success" && result.result.meta.AffectedNodes) {
                    for (const node of result.result.meta.AffectedNodes) {
                        if ('CreatedNode' in node && node.CreatedNode?.LedgerEntryType === "PayChannel") {
                            channelId = node.CreatedNode.LedgerIndex;
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
                                channelId:
                                    status === "success" ? channelId : "N/A",
                                account: wallet.address,
                                amount,
                                destination,
                                settleDelay,
                                publicKey,
                                cancelAfter,
                                destinationTag,
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
                        text: `Error creating Payment Channel: ${
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
