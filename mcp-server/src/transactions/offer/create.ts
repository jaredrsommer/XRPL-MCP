import { Client, Wallet, OfferCreate, OfferCreateFlags } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register offer-create tool
server.registerTool(
    "offer-create",
    {
        title: "Create Offer",
        description: "Create an Offer (order) in the XRP Ledger's decentralized exchange",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet creating the offer. If not provided, the connected wallet will be used."
                ),
            takerGets: z
                .object({
                    currency: z.string().describe("Currency code (e.g., XRP, USD)"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (if not XRP)"),
                    value: z.string().describe("Amount the taker receives"),
                })
                .describe("The amount the taker receives (what you are selling)"),
            takerPays: z
                .object({
                    currency: z.string().describe("Currency code (e.g., XRP, USD)"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (if not XRP)"),
                    value: z.string().describe("Amount the taker pays"),
                })
                .describe("The amount the taker pays (what you are buying)"),
            expiration: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional time after which the Offer is no longer active (seconds since Ripple Epoch)."
                ),
            offerSequence: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional sequence number. If provided, replace/cancel the existing offer with this sequence number."
                ),
            passive: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    "If true, the offer does not consume offers that exactly match it, and instead becomes an Offer object in the ledger."
                ),
            immediateOrCancel: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    "If true, the offer executes immediately against matching offers or is cancelled."
                ),
            fillOrKill: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    "If true, the offer executes immediately and entirely against matching offers or is cancelled."
                ),
            sell: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    "If true, the offer is a sell offer (offer to sell TakerGets). Requires TakerPays to be XRP for NFTs."
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
        takerGets,
        takerPays,
        expiration,
        offerSequence,
        passive,
        immediateOrCancel,
        fillOrKill,
        sell,
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

            // Format amounts
            const formatAmount = (amt: any): xrpl.Amount => {
                if (!amt) {
                    throw new Error("Amount is required");
                }
                if (amt.currency === "XRP") {
                    return xrpl.xrpToDrops(amt.value);
                } else {
                    return {
                        currency: amt.currency,
                        issuer: amt.issuer,
                        value: amt.value,
                    };
                }
            };

            // Create OfferCreate transaction
            const offerCreateTx: OfferCreate = {
                TransactionType: "OfferCreate",
                Account: wallet.address,
                TakerGets: formatAmount(takerGets),
                TakerPays: formatAmount(takerPays),
                Flags: 0, // Start with no flags
            };

            // Add optional fields
            if (expiration) {
                offerCreateTx.Expiration = expiration;
            }
            if (offerSequence) {
                offerCreateTx.OfferSequence = offerSequence;
            }

            // Set flags based on boolean options
            let flags = 0;
            if (passive) flags |= OfferCreateFlags.tfPassive;
            if (immediateOrCancel)
                flags |= OfferCreateFlags.tfImmediateOrCancel;
            if (fillOrKill) flags |= OfferCreateFlags.tfFillOrKill;
            if (sell) flags |= OfferCreateFlags.tfSell;

            if (flags > 0) {
                offerCreateTx.Flags = flags;
            }

            // Add optional fee if provided
            if (fee) {
                offerCreateTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(offerCreateTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let createdOfferSequence = -1;
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract OfferSequence from metadata if successful and an offer was created
                if (status === "success" && result.result.meta.AffectedNodes) {
                    for (const node of result.result.meta.AffectedNodes) {
                        const createdNode =
                            "CreatedNode" in node
                                ? node.CreatedNode
                                : undefined;
                        if (createdNode?.LedgerEntryType === "Offer") {
                            createdOfferSequence = (
                                createdNode.NewFields as any
                            )?.Sequence;
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
                                // Return sequence if offer created
                                offerSequence:
                                    status === "success" &&
                                    createdOfferSequence !== -1
                                        ? createdOfferSequence
                                        : offerSequence // If replacing, return original sequence
                                        ? offerSequence
                                        : "N/A", // Otherwise N/A
                                account: wallet.address,
                                takerGets,
                                takerPays,
                                flagsSet: {
                                    passive,
                                    immediateOrCancel,
                                    fillOrKill,
                                    sell,
                                },
                                expiration,
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
                        text: `Error creating Offer: ${
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
