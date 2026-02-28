import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

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
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
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
        fromSeed,
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
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Calculate flags
            let flags = 0;
            if (canLock) flags |= MPTokenIssuanceCreateFlags.tfMPTCanLock;
            if (requireAuth) flags |= MPTokenIssuanceCreateFlags.tfMPTRequireAuth;
            if (canEscrow) flags |= MPTokenIssuanceCreateFlags.tfMPTCanEscrow;
            if (canTrade) flags |= MPTokenIssuanceCreateFlags.tfMPTCanTrade;
            if (canTransfer) flags |= MPTokenIssuanceCreateFlags.tfMPTCanTransfer;
            if (canClawback) flags |= MPTokenIssuanceCreateFlags.tfMPTCanClawback;

            // Build transaction - using 'any' for new transaction types not yet in xrpl.js types
            const tx: any = {
                TransactionType: "MPTokenIssuanceCreate",
                Account: wallet.address,
            };

            if (flags > 0) tx.Flags = flags;
            if (assetScale !== undefined) tx.AssetScale = assetScale;
            if (maxAmount) tx.MaximumAmount = maxAmount;
            if (transferFee !== undefined) tx.TransferFee = transferFee;
            if (metadata) tx.MPTokenMetadata = toHex(metadata);
            if (fee) tx.Fee = fee;

            const prepared = await client.autofill(tx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let mptIssuanceID: string | undefined;

            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract MPTokenIssuanceID from created nodes
                const createdNodes = (result.result.meta as any).AffectedNodes?.filter(
                    (node: any) => node.CreatedNode?.LedgerEntryType === "MPTokenIssuance"
                );
                if (createdNodes?.length > 0) {
                    mptIssuanceID = createdNodes[0].CreatedNode.LedgerIndex;
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                mptIssuanceID,
                                issuer: wallet.address,
                                assetScale: assetScale ?? 0,
                                maxAmount: maxAmount ?? "unlimited",
                                transferFee: transferFee ?? 0,
                                flags: {
                                    canLock: !!canLock,
                                    requireAuth: !!requireAuth,
                                    canEscrow: !!canEscrow,
                                    canTrade: !!canTrade,
                                    canTransfer: !!canTransfer,
                                    canClawback: !!canClawback,
                                },
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
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
