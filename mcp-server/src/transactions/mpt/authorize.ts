import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// MPTokenAuthorize flags
const MPTokenAuthorizeFlags = {
    tfMPTUnauthorize: 0x0001,  // Remove authorization (issuer) or opt out (holder)
};

server.registerTool(
    "mpt-authorize",
    {
        title: "Authorize MPT",
        description: "Authorize an account to hold a Multi-Purpose Token (MPT), or as a holder, opt-in to hold an MPT. For MPTs with requireAuth flag, issuers must authorize holders before they can receive tokens.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT (64-character hex string)."
                ),
            holder: z
                .string()
                .optional()
                .describe(
                    "The account address to authorize. Only used when the transaction sender is the issuer authorizing a holder. Omit when opting in as a holder."
                ),
            unauthorize: z
                .boolean()
                .optional()
                .describe(
                    "If true, remove the authorization (issuer) or opt out of holding the token (holder). Default is false (authorize/opt-in)."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
    },
    async ({
        walletName,
        mptIssuanceID,
        holder,
        unauthorize,
        fee,
        useTestnet,
    }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "MPTokenAuthorize",
                MPTokenIssuanceID: mptIssuanceID,
            };

            if (holder) {
                tx.Holder = holder;
            }

            if (unauthorize) {
                tx.Flags = MPTokenAuthorizeFlags.tfMPTUnauthorize;
            }

            if (fee) tx.Fee = fee;

            const action = unauthorize
                ? (holder ? "unauthorize holder" : "opt out")
                : (holder ? "authorize holder" : "opt in");

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "mpt-authorize",
                summary: {
                    transactionType: "MPTokenAuthorize",
                    fromAddress: "",
                    description: `MPT ${action} for issuance ${mptIssuanceID}${holder ? ` (holder: ${holder})` : ""}`,
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
                        text: `Error with MPT authorization: ${
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
