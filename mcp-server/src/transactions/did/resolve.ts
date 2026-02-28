import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL, DID_PREFIX } from "../../core/constants.js";
import { retrieveDIDDocument } from "../../core/utils.js";

// Register resolve-did tool
server.registerTool(
    "resolve-did",
    {
        title: "Resolve DID",
        description: "Resolve a DID to retrieve its DID document",
        inputSchema: {
            did: z
                .string()
                .describe(
                    "The DID to resolve (format: did:xrpl:[network]:[address])"
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ did, useTestnet }) => {
        let client: Client | null = null;
        try {
            // Parse DID to extract network and address
            if (!did.startsWith(DID_PREFIX)) {
                throw new Error(
                    `Invalid DID format. Must start with ${DID_PREFIX}`
                );
            }

            const parts = did.substring(DID_PREFIX.length).split(":");
            if (parts.length !== 2) {
                throw new Error(
                    "Invalid DID format. Expected format: did:xrpl:[network]:[address]"
                );
            }

            const [network, address] = parts;
            // Prioritize useTestnet if provided, otherwise infer from DID
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : network === "testnet";

            client = await getXrplClient(useTestnetNetwork);

            // Retrieve DID document
            const didDocument = await retrieveDIDDocument(client, address);

            if (!didDocument) {
                throw new Error(
                    "DID document not found for the specified address"
                );
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                did,
                                didDocument,
                                _meta: {
                                    network: useTestnetNetwork
                                        ? TESTNET_URL
                                        : MAINNET_URL,
                                    networkType: useTestnetNetwork
                                        ? "testnet"
                                        : "mainnet",
                                },
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
                        text: `Error resolving DID: ${
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
