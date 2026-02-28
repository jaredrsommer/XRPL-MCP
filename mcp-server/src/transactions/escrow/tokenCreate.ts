import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register token-escrow-create tool
server.registerTool(
    "token-escrow-create",
    {
        title: "Create Token Escrow",
        description:
            "Create an Escrow for fungible tokens (Trust Line Tokens or MPTs) on the XRP Ledger. Requires the TokenEscrow amendment. For Trust Line Tokens, the issuer must have lsfAllowTrustLineLocking enabled. For MPTs, the issuance must have lsfMPTCanEscrow enabled.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            tokenType: z
                .enum(["trustline", "mpt"])
                .describe(
                    "Type of token to escrow: 'trustline' for Trust Line Tokens (issued currencies) or 'mpt' for Multi-Purpose Tokens."
                ),
            currency: z
                .string()
                .optional()
                .describe(
                    "Currency code for Trust Line Token escrow (e.g., 'USD', 'EUR'). Required when tokenType is 'trustline'."
                ),
            issuer: z
                .string()
                .optional()
                .describe(
                    "Issuer account address for Trust Line Token escrow. Required when tokenType is 'trustline'."
                ),
            mptIssuanceID: z
                .string()
                .optional()
                .describe(
                    "MPTokenIssuanceID for MPT escrow (64-character hex string). Required when tokenType is 'mpt'."
                ),
            value: z
                .string()
                .describe("Amount of tokens to escrow."),
            destination: z
                .string()
                .describe("Address of the recipient of the escrowed tokens."),
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
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be cancelled. REQUIRED for token escrows."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Note: Token Escrow requires the TokenEscrow amendment."
                ),
        },
    },
    async ({
        walletName,
        tokenType,
        currency,
        issuer,
        mptIssuanceID,
        value,
        destination,
        destinationTag,
        condition,
        finishAfter,
        cancelAfter,
        fee,
        useTestnet,
    }) => {
        try {
            // Validate required fields based on token type
            if (tokenType === "trustline") {
                if (!currency || !issuer) {
                    throw new Error(
                        "Currency and issuer are required for Trust Line Token escrow."
                    );
                }
            } else if (tokenType === "mpt") {
                if (!mptIssuanceID) {
                    throw new Error(
                        "mptIssuanceID is required for MPT escrow."
                    );
                }
            }

            // Token escrows require cancelAfter
            if (!cancelAfter) {
                throw new Error(
                    "cancelAfter is required for token escrows."
                );
            }

            // Ensure at least one release condition is specified
            if (!condition && !finishAfter) {
                throw new Error(
                    "Either condition or finishAfter must be specified for the escrow."
                );
            }

            // Build Amount field based on token type
            let amount: any;
            if (tokenType === "trustline") {
                amount = {
                    currency: currency,
                    issuer: issuer,
                    value: value,
                };
            } else {
                amount = {
                    mpt_issuance_id: mptIssuanceID,
                    value: value,
                };
            }

            const tx: Record<string, unknown> = {
                TransactionType: "EscrowCreate",
                Amount: amount,
                Destination: destination,
                CancelAfter: cancelAfter,
            };

            if (destinationTag) {
                tx.DestinationTag = destinationTag;
            }
            if (condition) {
                tx.Condition = condition;
            }
            if (finishAfter) {
                tx.FinishAfter = finishAfter;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const amountDesc =
                tokenType === "trustline"
                    ? `${value} ${currency}`
                    : `${value} MPT(${mptIssuanceID})`;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "token-escrow-create",
                summary: {
                    transactionType: "EscrowCreate",
                    fromAddress: "",
                    toAddress: destination,
                    amount: value,
                    currency:
                        tokenType === "trustline"
                            ? currency
                            : `MPT(${mptIssuanceID})`,
                    description: `Create token escrow of ${amountDesc} to ${destination}`,
                },
                resultExtractor: (txResult) => {
                    const meta = txResult.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    for (const node of meta.AffectedNodes) {
                        if (
                            "CreatedNode" in node &&
                            node.CreatedNode?.LedgerEntryType === "Escrow"
                        ) {
                            return {
                                escrowSequence: (
                                    node.CreatedNode.NewFields as any
                                )?.Sequence,
                                escrowIndex: node.CreatedNode.LedgerIndex,
                            };
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
                        text: `Error creating token escrow: ${
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
