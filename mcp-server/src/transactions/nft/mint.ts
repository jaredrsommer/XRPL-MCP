import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "nft-mint",
    {
        title: "Mint NFT",
        description: "Create a non-fungible token on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
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
                        .describe("The token can only be bought or sold for XRP"),
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
        fromSeed,
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
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;
            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
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
                    // XRP amount in drops
                    return amountObj;
                } else if (amountObj.mpt_issuance_id) {
                    // MPT payment
                    return {
                        mpt_issuance_id: amountObj.mpt_issuance_id,
                        value: amountObj.value,
                    };
                } else if (amountObj.currency.toUpperCase() === "XRP") {
                    // XRP in object form - convert to drops
                    return amountObj.value;
                } else {
                    // Other issued currency
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
                // Check if already hex
                if (/^[0-9a-fA-F]+$/.test(uri)) {
                    uriHex = uri;
                } else {
                    // Convert string to hex
                    uriHex = Buffer.from(uri).toString("hex");
                }

                // Check length after conversion
                if (uriHex && uriHex.length > 512) {
                    throw new Error("URI exceeds maximum length of 256 bytes");
                }
            }

            // Create NFTokenMint transaction
            const nftokenMintTx: any = {
                TransactionType: "NFTokenMint",
                Account: wallet.address,
                NFTokenTaxon: nftokenTaxon,
            };

            // Add optional fields if provided
            if (issuer) {
                nftokenMintTx.Issuer = issuer;
            }

            if (transferFee !== undefined) {
                nftokenMintTx.TransferFee = transferFee;
            }

            if (uriHex) {
                nftokenMintTx.URI = uriHex;
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
                    nftokenMintTx.Flags = flagsValue;
                }
            }

            // Add offer details if provided
            if (amount) {
                nftokenMintTx.Amount = formatAmount(amount);
            }

            if (expiration !== undefined) {
                nftokenMintTx.Expiration = expiration;
            }

            if (destination) {
                nftokenMintTx.Destination = destination;
            }

            // Add memos if provided
            if (memos && memos.length > 0) {
                nftokenMintTx.Memos = memos.map((memo) => {
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

            // Add optional fee if provided
            if (fee) {
                nftokenMintTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(nftokenMintTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Get the NFToken ID from the transaction metadata
            let nftokenID = null;
            if (
                status === "success" &&
                typeof result.result.meta !== "string" &&
                result.result.meta &&
                result.result.meta.AffectedNodes
            ) {
                // Look for created NFToken in the affected nodes
                const affectedNodes = result.result.meta.AffectedNodes;
                for (const node of affectedNodes) {
                    // Using type assertion to handle different node types
                    const modifiedNode = node as any;
                    if (
                        modifiedNode.ModifiedNode &&
                        modifiedNode.ModifiedNode.LedgerEntryType ===
                            "NFTokenPage" &&
                        modifiedNode.ModifiedNode.FinalFields &&
                        modifiedNode.ModifiedNode.FinalFields.NFTokens
                    ) {
                        const previousTokens = (
                            modifiedNode.ModifiedNode.PreviousFields
                                ?.NFTokens || []
                        ).map((t: any) => t.NFToken.NFTokenID);
                        const finalTokens = (
                            modifiedNode.ModifiedNode.FinalFields.NFTokens || []
                        ).map((t: any) => t.NFToken.NFTokenID);
                        // Find new token IDs that weren't in the previous state
                        const newTokenIDs = finalTokens.filter(
                            (id: string) => !previousTokens.includes(id)
                        );
                        if (newTokenIDs.length > 0) {
                            nftokenID = newTokenIDs[0];
                            break;
                        }
                    }
                }
            }

            // Get account's NFTs
            let accountNFTs: any[] = [];
            if (status === "success") {
                try {
                    const nftsResponse = await client.request({
                        command: "account_nfts",
                        account: issuer || wallet.address,
                        ledger_index: "validated",
                    });
                    if (nftsResponse.result.account_nfts) {
                        accountNFTs = nftsResponse.result.account_nfts;
                    }
                } catch (error) {
                    console.error("Error fetching account NFTs:", error);
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
                                account: wallet.address,
                                issuer: issuer || wallet.address,
                                nftokenTaxon,
                                nftokenID,
                                uri: uriHex,
                                flags: flags || {},
                                accountNFTs,
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
                        text: `Error minting NFT: ${
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
