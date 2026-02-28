import { z } from "zod";
import { server } from "../server/server.js";
import { executor } from "../core/custody/index.js";

// Register set-account-properties tool
server.registerTool(
    "set-account-properties",
    {
        title: "Set Account Properties",
        description: "Set or modify account properties on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            domain: z
                .string()
                .optional()
                .describe(
                    "Domain name to associate with this account (in hex format)"
                ),
            emailHash: z
                .string()
                .optional()
                .describe("MD5 hash of an email address for Gravatar (in hex)"),
            messageKey: z
                .string()
                .optional()
                .describe(
                    "Public key for sending encrypted messages to this account"
                ),
            transferRate: z
                .number()
                .optional()
                .describe(
                    "Fee to charge when users transfer this account's tokens (in billionths)"
                ),
            tickSize: z
                .number()
                .optional()
                .describe("Tick size for offers (between 3-15, or 0 to disable)"),
            setFlag: z
                .number()
                .optional()
                .describe("Integer flag to enable for this account"),
            clearFlag: z
                .number()
                .optional()
                .describe("Integer flag to disable for this account"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { idempotentHint: true },
    },
    async ({
        walletName,
        domain,
        emailHash,
        messageKey,
        transferRate,
        tickSize,
        setFlag,
        clearFlag,
        fee,
        useTestnet,
    }) => {
        try {
            // Create AccountSet transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AccountSet",
            };

            // Add optional fields if provided
            if (domain !== undefined) tx.Domain = domain;
            if (emailHash !== undefined) tx.EmailHash = emailHash;
            if (messageKey !== undefined) tx.MessageKey = messageKey;
            if (transferRate !== undefined) tx.TransferRate = transferRate;
            if (tickSize !== undefined) tx.TickSize = tickSize;
            if (setFlag !== undefined) tx.SetFlag = setFlag;
            if (clearFlag !== undefined) tx.ClearFlag = clearFlag;
            if (fee !== undefined) tx.Fee = fee;

            // Build description of what's being changed
            const changes: string[] = [];
            if (domain !== undefined) changes.push("domain");
            if (emailHash !== undefined) changes.push("emailHash");
            if (messageKey !== undefined) changes.push("messageKey");
            if (transferRate !== undefined) changes.push("transferRate");
            if (tickSize !== undefined) changes.push("tickSize");
            if (setFlag !== undefined) changes.push(`setFlag(${setFlag})`);
            if (clearFlag !== undefined) changes.push(`clearFlag(${clearFlag})`);

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "set-account-properties",
                summary: {
                    transactionType: "AccountSet",
                    fromAddress: "",
                    description: `Set account properties: ${changes.join(", ") || "no changes"}`,
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
                        text: `Error setting account properties: ${
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
