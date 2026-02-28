import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

server.registerTool(
    "nft-mint",
    {
        title: "Mint NFT",
        description: "Create a non-fungible token on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            nftokenTaxon: z
                .number()
                .describe(
                    "An arbitrary identifier for a collection of related NFTs"
                ),
            issuer: z
                .string()
                .optional()
                .describe(
                    "Issuer account (if minting on behalf of another account)"
                ),
            transferFee: z
                .number()
                .min(0)
                .max(50000)
                .optional()
                .describe(
                    "Fee for secondary sales (0-50000, representing 0.00%-50.00%)"
                ),
            uri: z
                .string()
                .optional()
                .describe(
                    "URI pointing to token metadata (up to 256 bytes, will be converted to hex)"
                ),
            flags: z
                .object({
                    burnable: z
                        .boolean()
                        .optional()
                        .describe("Allow the issuer to burn the token"),
                    onlyXRP: z
                        .boolean()
                        .optional()
                        .describe(
                            "The token can only be bought or sold for XRP"
                        ),
                    transferable: z
                        .boolean()
                        .optional()
                        .describe("The token can be transferred to others"),
                    mutable: z
                        .boolean()
                        .optional()
                        .describe("The URI field can be updated later"),
                })
                .optional()
                .describe("Token flags"),
            amount: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer account address"),
                    value: z.string().describe("Amount value"),
                })
                .optional()
                .describe("Amount expected for the NFToken"),
            expiration: z
                .number()
                .optional()
                .describe(
                    "Time after which the offer is no longer active (seconds since Ripple Epoch)"
                ),
            destination: z
                .string()
                .optional()
                .describe("Account that may accept this offer"),
            memos: z
                .array(
                    z.object({
                        memoType: z
                            .string()
                            .optional()
                            .describe("Type of memo (hex encoded)"),
                        memoData: z
                            .string()
                            .optional()
                            .describe("Content of memo (hex encoded)"),
                        memoFormat: z
                            .string()
                            .optional()
                            .describe("Format of memo (hex encoded)"),
                    })
                )
                .optional()
                .describe("Array of memos to attach to the transaction"),
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
        walletName,
        nftokenTaxon,
        issuer,
        transferFee,
        uri,
        flags,
        amount,
        expiration,
        destination,
        memos,
        fee,
        useTestnet,
    }) => {
        try {
            // Validate inputs
            if (
                transferFee !== undefined &&
                (!flags || flags.transferable !== true)
            ) {
                throw new Error(
                    "TransferFee can only be set if the transferable flag is enabled"
                );
            }

            if ((destination || expiration) && !amount) {
                throw new Error(
                    "If destination or expiration is specified, amount must also be specified"
                );
            }

            // Format amount based on type
            const formatAmount = (amountObj: any) => {
                if (typeof amountObj === "string") {
                    return amountObj;
                } else if (amountObj.mpt_issuance_id) {
                    return {
                        mpt_issuance_id: amountObj.mpt_issuance_id,
                        value: amountObj.value,
                    };
                } else if (amountObj.currency.toUpperCase() === "XRP") {
                    return amountObj.value;
                } else {
                    return {
                        currency: amountObj.currency,
                        issuer: amountObj.issuer,
                        value: amountObj.value,
                    };
                }
            };

            // Convert URI to hex if provided
            let uriHex = undefined;
            if (uri) {
                if (/^[0-9a-fA-F]+$/.test(uri)) {
                    uriHex = uri;
                } else {
                    uriHex = Buffer.from(uri).toString("hex");
                }

                if (uriHex && uriHex.length > 512) {
                    throw new Error("URI exceeds maximum length of 256 bytes");
                }
            }

            // Create NFTokenMint transaction
            const tx: Record<string, unknown> = {
                TransactionType: "NFTokenMint",
                NFTokenTaxon: nftokenTaxon,
            };

            if (issuer) {
                tx.Issuer = issuer;
            }

            if (transferFee !== undefined) {
                tx.TransferFee = transferFee;
            }

            if (uriHex) {
                tx.URI = uriHex;
            }

            // Set flags based on options
            if (flags) {
                let flagsValue = 0;
                if (flags.burnable === true) {
                    flagsValue |= 0x00000001; // tfBurnable
                }
                if (flags.onlyXRP === true) {
                    flagsValue |= 0x00000002; // tfOnlyXRP
                }
                if (flags.transferable === true) {
                    flagsValue |= 0x00000008; // tfTransferable
                }
                if (flags.mutable === true) {
                    flagsValue |= 0x00000010; // tfMutable
                }
                if (flagsValue !== 0) {
                    tx.Flags = flagsValue;
                }
            }

            if (amount) {
                tx.Amount = formatAmount(amount);
            }

            if (expiration !== undefined) {
                tx.Expiration = expiration;
            }

            if (destination) {
                tx.Destination = destination;
            }

            // Add memos if provided
            if (memos && memos.length > 0) {
                tx.Memos = memos.map((memo) => {
                    const memoObj: any = { Memo: {} };
                    if (memo.memoType) {
                        memoObj.Memo.MemoType = memo.memoType;
                    }
                    if (memo.memoData) {
                        memoObj.Memo.MemoData = memo.memoData;
                    }
                    if (memo.memoFormat) {
                        memoObj.Memo.MemoFormat = memo.memoFormat;
                    }
                    return memoObj;
                });
            }

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "nft-mint",
                summary: {
                    transactionType: "NFTokenMint",
                    fromAddress: "",
                    description: `Mint NFT with taxon ${nftokenTaxon}${uri ? ` and URI ${uri}` : ""}`,
                },
                resultExtractor: (txResult) => {
                    const meta = txResult.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    for (const node of meta.AffectedNodes) {
                        if (
                            node.ModifiedNode &&
                            node.ModifiedNode.LedgerEntryType ===
                                "NFTokenPage" &&
                            node.ModifiedNode.FinalFields &&
                            node.ModifiedNode.FinalFields.NFTokens
                        ) {
                            const previousTokens = (
                                node.ModifiedNode.PreviousFields?.NFTokens || []
                            ).map((t: any) => t.NFToken.NFTokenID);
                            const finalTokens = (
                                node.ModifiedNode.FinalFields.NFTokens || []
                            ).map((t: any) => t.NFToken.NFTokenID);
                            const newTokenIDs = finalTokens.filter(
                                (id: string) => !previousTokens.includes(id)
                            );
                            if (newTokenIDs.length > 0) {
                                return { nftokenID: newTokenIDs[0] };
                            }
                        }
                    }
                    return {};
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
                                networkType:
                                    result.pendingTransaction.networkType,
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
                        text: `Error minting NFT: ${
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
