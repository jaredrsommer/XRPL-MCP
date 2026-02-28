import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

// MPTokenIssuanceCreate flags
const MPTokenIssuanceCreateFlags = {
    tfMPTCanLock: 0x0002,        // Issuer can lock tokens
    tfMPTRequireAuth: 0x0004,    // Holders must be authorized
    tfMPTCanEscrow: 0x0008,      // Tokens can be escrowed
    tfMPTCanTrade: 0x0010,       // Tokens can be traded on DEX
    tfMPTCanTransfer: 0x0020,    // Tokens can be transferred
    tfMPTCanClawback: 0x0040,    // Issuer can clawback tokens
};

server.registerTool(
    "mpt-issuance-create",
    {
        title: "Create MPT Issuance",
        description: "Create a new Multi-Purpose Token (MPT) issuance on the XRP Ledger. MPTs are optimized fungible tokens for use cases like stablecoins.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            assetScale: z
                .number()
                .int()
                .min(0)
                .max(10)
                .optional()
                .describe(
                    "Number of decimal places for the token (0-10). For example, 2 means the smallest unit is 0.01"
                ),
            maxAmount: z
                .string()
                .optional()
                .describe(
                    "Maximum amount of tokens that can ever be issued. Leave empty for unlimited supply."
                ),
            transferFee: z
                .number()
                .int()
                .min(0)
                .max(50000)
                .optional()
                .describe(
                    "Transfer fee in basis points (0-50000, where 1000 = 1%). Fee charged when tokens are transferred between holders."
                ),
            metadata: z
                .string()
                .optional()
                .describe(
                    "Arbitrary metadata for the token (will be hex-encoded). Can include token name, description, etc."
                ),
            canLock: z
                .boolean()
                .optional()
                .describe("If true, the issuer can lock individual token holders."),
            requireAuth: z
                .boolean()
                .optional()
                .describe(
                    "If true, holders must be authorized by the issuer before they can hold tokens."
                ),
            canEscrow: z
                .boolean()
                .optional()
                .describe("If true, tokens can be placed in escrow."),
            canTrade: z
                .boolean()
                .optional()
                .describe("If true, tokens can be traded on the DEX."),
            canTransfer: z
                .boolean()
                .optional()
                .describe(
                    "If true, tokens can be transferred between holders. Set to false for non-transferable tokens."
                ),
            canClawback: z
                .boolean()
                .optional()
                .describe("If true, the issuer can claw back tokens from holders."),
            fee: z.string().optional().describe("Transaction fee in drops"),
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
        assetScale,
        maxAmount,
        transferFee,
        metadata,
        canLock,
        requireAuth,
        canEscrow,
        canTrade,
        canTransfer,
        canClawback,
        fee,
        useTestnet,
    }) => {
        try {
            // Calculate flags
            let flags = 0;
            if (canLock) flags |= MPTokenIssuanceCreateFlags.tfMPTCanLock;
            if (requireAuth) flags |= MPTokenIssuanceCreateFlags.tfMPTRequireAuth;
            if (canEscrow) flags |= MPTokenIssuanceCreateFlags.tfMPTCanEscrow;
            if (canTrade) flags |= MPTokenIssuanceCreateFlags.tfMPTCanTrade;
            if (canTransfer) flags |= MPTokenIssuanceCreateFlags.tfMPTCanTransfer;
            if (canClawback) flags |= MPTokenIssuanceCreateFlags.tfMPTCanClawback;

            // Build transaction
            const tx: Record<string, unknown> = {
                TransactionType: "MPTokenIssuanceCreate",
            };

            if (flags > 0) tx.Flags = flags;
            if (assetScale !== undefined) tx.AssetScale = assetScale;
            if (maxAmount) tx.MaximumAmount = maxAmount;
            if (transferFee !== undefined) tx.TransferFee = transferFee;
            if (metadata) tx.MPTokenMetadata = toHex(metadata);
            if (fee) tx.Fee = fee;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "mpt-issuance-create",
                summary: {
                    transactionType: "MPTokenIssuanceCreate",
                    fromAddress: "",
                    description: `Create MPT issuance (scale: ${assetScale ?? 0}, maxAmount: ${maxAmount ?? "unlimited"}, transferFee: ${transferFee ?? 0})`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    const createdNodes = meta.AffectedNodes.filter(
                        (node: any) => node.CreatedNode?.LedgerEntryType === "MPTokenIssuance"
                    );
                    if (createdNodes?.length > 0) {
                        return { mptIssuanceID: createdNodes[0].CreatedNode.LedgerIndex };
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
                        text: `Error creating MPT issuance: ${
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
