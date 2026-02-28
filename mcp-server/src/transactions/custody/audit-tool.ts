import { z } from "zod";
import { server } from "../../server/server.js";
import { auditLog } from "../../core/custody/index.js";

// Get audit log entries
server.registerTool(
    "get-audit-log",
    {
        title: "Get Audit Log",
        description:
            "Retrieve the audit log of all signing and transaction operations, optionally filtered by wallet, tool, or network.",
        inputSchema: {
            limit: z
                .number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe("Maximum number of entries to return (default 50)."),
            walletName: z
                .string()
                .optional()
                .describe("Filter entries by wallet name."),
            toolName: z
                .string()
                .optional()
                .describe("Filter entries by tool name."),
            network: z
                .enum(["testnet", "mainnet"])
                .optional()
                .describe("Filter entries by network."),
        },
        annotations: { readOnlyHint: true },
    },
    async ({ limit, walletName, toolName, network }) => {
        try {
            const entries = auditLog.getEntries({
                limit,
                walletName,
                toolName,
                network,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                totalEntries: auditLog.size,
                                returned: entries.length,
                                entries,
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
                        text: `Error retrieving audit log: ${
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
