import { Client, XrplError, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

// Define the transaction type for TicketCreate
type TicketCreateTransaction = {
    TransactionType: "TicketCreate";
    Account: string;
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
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Seed of the wallet to use. If not provided, the connected wallet will be used."
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
    async ({ fromSeed, ticketCount, fee, useTestnet }) => {
        let client: Client | null = null;

        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            // Connect to XRPL
            client = await getXrplClient(useTestnetNetwork);

            // Create wallet from seed if provided or use connected wallet
            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide fromSeed."
                );
            }

            // Check current ticket count
            const accountInfo = await client.request({
                command: "account_info",
                account: wallet.address,
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

            // Create TicketCreate transaction
            const ticketCreateTx: TicketCreateTransaction = {
                TransactionType: "TicketCreate",
                Account: wallet.address,
                TicketCount: ticketCount,
            };

            // Add optional fee if provided
            if (fee) {
                ticketCreateTx.Fee = fee;
            }

            // Prepare, sign, and submit transaction
            const prepared = await client.autofill(ticketCreateTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            // Process the result
            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                account: wallet.address,
                                ticketCount,
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
            // Handle errors
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
        } finally {
            // Disconnect from the client
            if (client) {
                await client.disconnect();
            }
        }
    }
);
