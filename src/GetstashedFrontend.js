/* global BigInt */
import React, { useState, useEffect } from 'react';
import { ZkSendLinkBuilder, ZkSendLink } from '@mysten/zksend';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { ClipboardIcon, DownloadIcon, AlertTriangleIcon, UploadIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './styles.css';

const ONE_SUI = BigInt(1000000000); // 1 SUI = 1,000,000,000 MIST
const MAX_LINKS = 100;

const GetstashedFrontend = () => {
    const [numLinks, setNumLinks] = useState(1);
    const [amountPerLink, setAmountPerLink] = useState(0.1);
    const [generatedLinks, setGeneratedLinks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [balance, setBalance] = useState(null);
    const [copySuccess, setCopySuccess] = useState('');
    const [uploadedLinks, setUploadedLinks] = useState([]);
    const [isClaimLoading, setIsClaimLoading] = useState(false);    
    const [claimResults, setClaimResults] = useState([]);   
    const [claimProgress, setClaimProgress] = useState(0);
    const [claimSummary, setClaimSummary] = useState(null);
    const [qrCodes, setQrCodes] = useState([]);
    const [claimedLinks, setClaimedLinks] = useState({});

    const currentAccount = useCurrentAccount();
    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

    useEffect(() => {
        const fetchBalance = async () => {
            if (currentAccount) {
                try {
                    const { totalBalance } = await client.getBalance({
                        owner: currentAccount.address,
                    });
                    setBalance(Number(totalBalance) / Number(ONE_SUI));
                } catch (error) {
                    console.error("Error fetching balance:", error);
                    setError('Failed to fetch balance. Please try again.');
                }
            }
        };

        fetchBalance();
    }, [currentAccount]);

    const createLinks = async () => {
        if (!currentAccount) {
            setError('Please connect your wallet first.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const links = [];
            const numLinksToCreate = Math.min(numLinks, MAX_LINKS);

            for (let i = 0; i < numLinksToCreate; i++) {
                const link = new ZkSendLinkBuilder({
                    sender: currentAccount.address,
                    client,
                });
                link.addClaimableMist(BigInt(Math.floor(amountPerLink * Number(ONE_SUI))));
                links.push(link);
            }

            const txBlock = await ZkSendLinkBuilder.createLinks({ links });
            await signAndExecuteTransaction(
                { transaction: txBlock },
                {
                    onSuccess: (result) => {
                        console.log('Transaction successful', result);
                        const generatedUrls = links.map((link) => link.getLink().replace('zksend.com', 'getstashed.com'));
                        setGeneratedLinks(generatedUrls);
                        setQrCodes(generatedUrls);
                        refreshBalance();
                        generatedUrls.forEach(link => checkClaimStatus(link));
                    },
                    onError: (err) => {
                        console.error("Error executing transaction:", err);
                        setError('An error occurred while creating links. Please try again.');
                    },
                }
            );

        } catch (error) {
            console.error("Error creating links:", error);
            setError('An error occurred while creating links. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshBalance = async () => {
        if (currentAccount) {
            try {
                const { totalBalance } = await client.getBalance({
                    owner: currentAccount.address,
                });
                setBalance(Number(totalBalance) / Number(ONE_SUI));
            } catch (error) {
                console.error("Error refreshing balance:", error);
            }
        }
    };

    const copyAllLinks = () => {
        const allLinks = generatedLinks.join('\n');
        navigator.clipboard.writeText(allLinks).then(() => {
            setCopySuccess('All links copied!');
            setTimeout(() => setCopySuccess(''), 3000);
        }).catch(err => {
            console.error('Failed to copy links: ', err);
            setError('Failed to copy links. Please try again.');
        });
    };

    const downloadLinks = () => {
        const element = document.createElement("a");
        const file = new Blob([generatedLinks.join('\n')], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = "getstashed_links.txt";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const links = content.split('\n').map(link => link.trim()).filter(link => link.length > 0);
                setUploadedLinks(links);
            };
            reader.readAsText(file);
        }
    };

const checkClaimStatus = async (linkUrl) => {
    try {
        const link = await ZkSendLink.fromUrl(linkUrl);
        console.log('Link object:', link); // Log the entire link object for debugging

        let isClaimed;
        if (typeof link.isClaimed === 'function') {
            isClaimed = await link.isClaimed();
        } else if (link.info && typeof link.info === 'function') {
            // If isClaimed is not available, try to use the info method
            const info = await link.info();
            isClaimed = info.claimed;
        } else if (link.claimed !== undefined) {
            // If the claimed property is directly accessible
            isClaimed = link.claimed;
        } else {
            // If we can't determine the claim status
            console.warn(`Unable to determine claim status for ${linkUrl}`);
            return false;
        }

        console.log(`Claim status for ${linkUrl}: ${isClaimed}`);
        return isClaimed;
    } catch (error) {
        console.error(`Error checking claim status for ${linkUrl}:`, error);
        return false;
    }
};

useEffect(() => {
    let isMounted = true;
    const checkInterval = 5000; // 5 seconds

    const checkAllLinks = async () => {
        if (!isMounted) return;

        const updatedClaimedLinks = { ...claimedLinks };
        let hasChanges = false;

        for (const link of generatedLinks) {
            if (!updatedClaimedLinks[link]) {
                try {
                    const isClaimed = await checkClaimStatus(link);
                    if (isClaimed) {
                        console.log(`Link ${link} has been claimed.`);
                        updatedClaimedLinks[link] = true;
                        hasChanges = true;
                    }
                } catch (error) {
                    console.error(`Failed to check status for ${link}:`, error);
                }
            }
        }

        if (hasChanges && isMounted) {
            setClaimedLinks(updatedClaimedLinks);
        }
    };

    const intervalId = setInterval(checkAllLinks, checkInterval);

    checkAllLinks(); // Initial check

    return () => {
        isMounted = false;
        clearInterval(intervalId);
    };
}, [generatedLinks]);


    const massClaimAssets = async () => {
        if (!currentAccount) {
            setError('Please connect your wallet first.');
            return;
        }

        setIsClaimLoading(true);
        setError('');
        setClaimProgress([]);
        const results = [];
        let successfulClaims = 0;

        for (let i = 0; i < uploadedLinks.length; i++) {
            const linkUrl = uploadedLinks[i];
            setClaimProgress(prev => [...prev, `Claiming link ${i + 1}...`]);
            try {
                const link = await ZkSendLink.fromUrl(linkUrl);
                const { balances } = link.assets;
                const claimResult = await link.claimAssets(currentAccount.address);
                
                const suiBalance = balances.find(b => b.coinType === "0x2::sui::SUI");
                const suiAmount = suiBalance ? Number(suiBalance.amount) / Number(ONE_SUI) : 0;

                results.push({
                    link: linkUrl,
                    claimedAmount: suiAmount.toFixed(4),
                });
                successfulClaims++;
                setClaimProgress(prev => [...prev, `Link ${i + 1} claimed successfully: ${suiAmount.toFixed(4)} SUI`]);
            } catch (error) {
                console.error(`Error claiming assets from link ${linkUrl}:`, error);
                results.push({
                    link: linkUrl,
                    error: error.message,
                });
                setClaimProgress(prev => [...prev, `Error claiming link ${i + 1}: ${error.message}`]);
            }
        }

        setClaimResults(results);
        setClaimSummary(`Successfully claimed ${successfulClaims} out of ${uploadedLinks.length} links.`);
        setIsClaimLoading(false);
    };

return (
    <div className="min-h-screen bg-gray-100 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Getstashed Bulk Link Generator</h1>
            </div>
            <div className="absolute top-4 right-4">
                <ConnectButton />
            </div>
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="p-8">
                    {currentAccount && (
                        <div className="mb-8 bg-gray-100 p-4 rounded-lg">
                            <p className="text-sm text-gray-600">Connected: 0x{currentAccount.address.slice(2, 6)}...{currentAccount.address.slice(-4)}</p>
                            <p className="text-lg font-semibold text-gray-800">Balance: {balance !== null ? `${balance.toFixed(4)} SUI` : 'Loading...'}</p>
                        </div>
                    )}

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Number of Links (max 100):
                            </label>
                            <input
                                type="number"
                                value={numLinks}
                                onChange={(e) => setNumLinks(Math.min(parseInt(e.target.value) || 1, MAX_LINKS))}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Amount per Link (in SUI):
                            </label>
                            <input
                                type="number"
                                value={amountPerLink}
                                onChange={(e) => setAmountPerLink(parseFloat(e.target.value) || 0)}
                                step="0.1"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                            />
                        </div>
                        <button 
                            onClick={createLinks} 
                            disabled={isLoading || !currentAccount}
                            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                        >
                            {isLoading ? 'Creating...' : 'Create Links'}
                        </button>
                    </div>

                    {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

                    {generatedLinks.length > 0 && (
                        <div className="mt-12">
                            <h2 className="text-2xl font-semibold mb-4">Generated Links with QR Codes</h2>
                            <div className="flex space-x-4 mb-6">
                                <button onClick={copyAllLinks} className="flex-1 flex items-center justify-center bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition duration-150 ease-in-out">
                                    <ClipboardIcon className="w-5 h-5 mr-2" /> Copy All
                                </button>
                                <button onClick={downloadLinks} className="flex-1 flex items-center justify-center bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out">
                                    <DownloadIcon className="w-5 h-5 mr-2" /> Download
                                </button>
                            </div>
                            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-md">
                                <div className="flex items-center">
                                    <AlertTriangleIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                                    <p>Save these links before closing or refreshing the page. This data will be lost otherwise.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {generatedLinks.map((link, index) => (
                                    <div key={index} className="bg-white p-4 rounded-lg shadow">
                                        <QRCodeSVG
                                            value={link}
                                            size={128}
                                            bgColor={claimedLinks[link] ? "#FFCCCB" : "#FFFFFF"}
                                            fgColor="#000000"
                                            level="L"
                                            includeMargin={true}
                                        />
                                        <p className="mt-2 text-sm break-all">
                                            <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{link}</a>
                                        </p>
                                        <p className="mt-1 text-sm font-semibold">
                                            Status: {claimedLinks[link] ? "Claimed" : "Unclaimed"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold mb-4">Mass Claim Assets</h2>
                        <div className="flex items-center space-x-4 mb-6">
                            <input 
                                type="file" 
                                accept=".txt" 
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-md file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100
                                    cursor-pointer"
                            />
                            <button 
                                onClick={massClaimAssets} 
                                disabled={isClaimLoading || !currentAccount || uploadedLinks.length === 0}
                                className="flex items-center justify-center bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                            >
                                <UploadIcon className="w-5 h-5 mr-2" /> {isClaimLoading ? 'Claiming...' : 'Claim Assets'}
                            </button>
                        </div>
                    </div>

                    {uploadedLinks.length > 0 && (
                        <div className="mt-4 bg-blue-50 p-4 rounded-md">
                            <p className="text-sm text-blue-600 font-semibold">{uploadedLinks.length} links loaded</p>
                        </div>
                    )}

                    {isClaimLoading && (
                        <div className="mt-6">
                            <p className="text-sm font-semibold text-gray-700 mb-2">Claiming in progress...</p>
                            <div className="bg-gray-100 p-4 rounded-md max-h-60 overflow-y-auto">
                                {claimProgress.map((progress, index) => (
                                    <p key={index} className="text-sm text-gray-700">{progress}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {claimSummary && (
                        <div className="mt-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-md">
                            <p className="font-semibold">{claimSummary}</p>
                        </div>
                    )}

                    {claimResults.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-xl font-semibold mb-4">Claim Results</h3>
                            <ul className="space-y-3">
                                {claimResults.map((result, index) => (
                                    <li key={index} className="bg-gray-50 p-4 rounded-md">
                                        <p className="text-sm text-gray-600 mb-1">Link {index + 1}: {result.link}</p>
                                        {result.error ? (
                                            <p className="text-sm text-red-500 font-medium">Error: {result.error}</p>
                                        ) : (
                                            <p className="text-sm font-semibold text-green-600">Claimed: {result.claimedAmount} SUI</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
);
}

export default GetstashedFrontend;
