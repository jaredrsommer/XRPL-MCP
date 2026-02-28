import { z } from "zod";
import { server } from "../server/server.js";
import { executor, walletRegistry } from "../core/custody/index.js";
import { getXrplClient } from "../core/services/clients.js";
import { isConnectedToTestnet } from "../core/state.js";

// Define the transaction type for TicketCreate
type TicketCreateTransaction = {
    TransactionType: "TicketCreate";
    Account?: string;
    TicketCount: number;
    Fee?: string;
};

// Register the TicketCreate tool
server.registerTool(
    "ticket-create",
    {
        title: "Create Ticket",
        description: "Create one or more sequence number tickets on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            ticketCount: z
                .number()
                .int()
                .min(1)
                .max(250)
                .describe("Number of tickets to create (1-250)"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet (true) or mainnet (false)"),
        },
    },
    async ({ walletName, ticketCount, fee, useTestnet }) => {
        try {
            // Resolve wallet to get address for pre-validation
            const provider = walletRegistry.resolve(walletName);
            const address = provider.getAddress();

            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            // Check current ticket count via a temporary client connection
            let client = null;
            try {
                client = await getXrplClient(useTestnetNetwork);

                const accountInfo = await client.request({
                    command: "account_info",
                    account: address,
                    ledger_index: "validated",
                });

                const currentTicketCount =
                    accountInfo.result.account_data.TicketCount || 0;

                // Verify it won't exceed the 250 ticket limit
                if (currentTicketCount + ticketCount > 250) {
                    throw new Error(
                        `This transaction would exceed the maximum of 250 tickets. Current count: ${currentTicketCount}, Requested: ${ticketCount}`
                    );
                }
            } finally {
                if (client) await client.disconnect();
            }

            // Create TicketCreate transaction
            const tx: Record<string, unknown> = {
                TransactionType: "TicketCreate",
                TicketCount: ticketCount,
            };

            // Add optional fee if provided
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "ticket-create",
                summary: {
                    transactionType: "TicketCreate",
                    fromAddress: "",
                    description: `Create ${ticketCount} ticket(s) for account ${address}`,
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
                        text: `Error creating tickets: ${
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
