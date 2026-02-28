import * as xrpl from "xrpl";
import { OfferCreateFlags } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register offer-create tool
server.registerTool(
    "offer-create",
    {
        title: "Create Offer",
        description: "Create an Offer (order) in the XRP Ledger's decentralized exchange",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
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
        annotations: { destructiveHint: true },
    },
    async ({
        walletName,
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
        try {
            // Format amounts
            const formatAmount = (amt: {
                currency: string;
                issuer?: string;
                value: string;
            }): xrpl.Amount => {
                if (amt.currency === "XRP") {
                    return xrpl.xrpToDrops(amt.value);
                } else {
                    return {
                        currency: amt.currency,
                        issuer: amt.issuer!,
                        value: amt.value,
                    };
                }
            };

            // Set flags based on boolean options
            let flags = 0;
            if (passive) flags |= OfferCreateFlags.tfPassive;
            if (immediateOrCancel)
                flags |= OfferCreateFlags.tfImmediateOrCancel;
            if (fillOrKill) flags |= OfferCreateFlags.tfFillOrKill;
            if (sell) flags |= OfferCreateFlags.tfSell;

            const tx: Record<string, unknown> = {
                TransactionType: "OfferCreate",
                TakerGets: formatAmount(takerGets),
                TakerPays: formatAmount(takerPays),
            };

            if (flags > 0) {
                tx.Flags = flags;
            }
            if (expiration) {
                tx.Expiration = expiration;
            }
            if (offerSequence) {
                tx.OfferSequence = offerSequence;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "offer-create",
                summary: {
                    transactionType: "OfferCreate",
                    fromAddress: "",
                    description: `Create Offer: selling ${takerGets.value} ${takerGets.currency} for ${takerPays.value} ${takerPays.currency}`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    let createdOfferSequence = null;
                    if (meta && meta.AffectedNodes) {
                        for (const node of meta.AffectedNodes) {
                            if (
                                "CreatedNode" in node &&
                                node.CreatedNode.LedgerEntryType === "Offer"
                            ) {
                                createdOfferSequence = (
                                    node.CreatedNode.NewFields as any
                                )?.Sequence;
                                break;
                            }
                        }
                    }
                    return {
                        createdOfferSequence:
                            createdOfferSequence ?? offerSequence ?? null,
                    };
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "pending_approval",
                                transactionId: result.pendingTransaction.id,
                                summary: result.pendingTransaction.summary,
                                expiresAt: result.pendingTransaction.expiresAt,
                                network: result.pendingTransaction.network,
                                networkType: result.pendingTransaction.networkType,
                                message: result.message,
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
        }
    }
);
