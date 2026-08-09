const WEB3_CONFIG = {
    contractAddress: "0xb6dae651468e9593e4581705a09c10a76ac1e0c8",
    masterTokenId: 4284,
    masterOwner: "0x2a6a8a75037540b6a66d38459d94181896dbb2ba",
    chainId: 1, // Ethereum Mainnet
    chainName: "Ethereum Mainnet",
    rpcUrl: "https://cloudflare-eth.com",
    
    // Pure layer definitions without hardcoded active states
    layers: [
        { id: 0, name: "Strings", tokenId: 4285, variants: ["Bright", "Dark", "Ambient"] },
        { id: 1, name: "Winds", tokenId: 4286, variants: ["Bamboo Flute", "Penny Whistle", "Melodica", "Nadaswaram"] },
        { id: 2, name: "Ambience", tokenId: 4287, variants: ["Kurinji", "Mullai", "Marutham", "Neidhal", "Paalai"] },
        { id: 3, name: "Rhythm", tokenId: 4288, variants: ["Mridangam & Latin", "Acoustic Drums", "Folk"] },
        { id: 4, name: "Traditional", tokenId: 4289, variants: ["Sarangi", "Veena", "Slide Guitar - Live"] },
        { id: 5, name: "Voices", tokenId: 4290, variants: ["Solo", "Folk voice", "Choir"] },
        { id: 6, name: "Guitars", tokenId: 4291, variants: ["Acoustic", "Electric"] },
        { id: 7, name: "Keys", tokenId: 4292, variants: ["Piano", "Mallet - Live"] },
        { id: 8, name: "Electronic", tokenId: 4293, variants: ["Synth & Bass", "Modular", "Live reactive layer"] }
    ],

    abi: [
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function useControlToken(uint256 tokenId, uint256 variantId) external",
        "function getControlToken(uint256 tokenId) view returns (uint256)"
    ]
};

let provider = null;
let signer = null;
let userAddress = null;

const connectWalletBtn = document.getElementById('connect-wallet-btn');
const dashboard = document.getElementById('layers-dashboard');
const mixContainer = document.getElementById('mix-tags-container');
const toast = document.getElementById('toast');

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// Dynamically fetch active variant index for a given token from the blockchain
async function fetchActiveVariantIndex(contract, tokenId) {
    try {
        const activeIndex = await contract.getControlToken(tokenId);
        return Number(activeIndex);
    } catch (err) {
        console.warn(`Could not fetch live state for token ${tokenId}, defaulting to 0:`, err);
        return 0;
    }
}

async function initDashboard(connectedAddress = null) {
    dashboard.innerHTML = '';
    mixContainer.innerHTML = '<span class="mix-tag-loading">Querying live blockchain state...</span>';

    if (!provider) {
        provider = new ethers.JsonRpcProvider(WEB3_CONFIG.rpcUrl);
    }
    const contract = new ethers.Contract(WEB3_CONFIG.contractAddress, WEB3_CONFIG.abi, provider);

    const liveMixStates = [];

    // First pass: Fetch live state for all layers from mainnet
    for (const layer of WEB3_CONFIG.layers) {
        let activeIndex = await fetchActiveVariantIndex(contract, layer.tokenId);
        let isOwned = false;

        if (connectedAddress) {
            try {
                const tokenOwner = await contract.ownerOf(layer.tokenId);
                if (tokenOwner && tokenOwner.toLowerCase() === connectedAddress.toLowerCase()) {
                    isOwned = true;
                }
            } catch (e) {
                console.log(`Wallet does not own token ${layer.tokenId}`);
            }
        }

        liveMixStates.push({
            ...layer,
            activeIndex,
            isOwned
        });
    }

    // Render Live Mix Summary Banner
    mixContainer.innerHTML = '';
    for (const item of liveMixStates) {
        const variantName = item.variants[item.activeIndex] || `Variant ${item.activeIndex}`;
        const pill = document.createElement('div');
        pill.className = 'mix-pill';
        pill.innerHTML = `
            <span class="stem-name">${item.name}:</span>
            <span class="stem-variant">${variantName}</span>
        `;
        mixContainer.appendChild(pill);
    }

    // Render Layer Cards
    for (const item of liveMixStates) {
        const card = document.createElement('div');
        card.className = `layer-card ${item.isOwned ? 'owned' : ''}`;
        
        const variantsOptions = item.variants.map((v, index) => 
            `<option value="${index}" ${index === item.activeIndex ? 'selected' : ''}>${v} (Variant ${index})</option>`
        ).join('');

        const activeVariantLabel = item.variants[item.activeIndex] || `Variant ${item.activeIndex}`;

        card.innerHTML = `
            <div class="layer-header">
                <div class="layer-title">
                    <h3>${item.name}</h3>
                </div>
                <span class="token-id">Token #${item.tokenId}</span>
            </div>
            <div class="ownership-badge">
                ${connectedAddress ? (item.isOwned ? '★ Owner Verified' : 'Locked') : 'Wallet Not Connected'}
            </div>
            <div class="layer-body">
                <div class="current-active-state">
                    Active State: <strong>${activeVariantLabel}</strong>
                </div>
                <label for="select-${item.id}">Select New Variant</label>
                <select id="select-${item.id}" class="layer-select" ${!item.isOwned ? 'disabled' : ''}>
                    ${variantsOptions}
                </select>
                <button class="publish-btn" id="pub-${item.id}" ${!item.isOwned ? 'disabled' : ''}>
                    ${item.isOwned ? 'Publish to Blockchain' : 'Locked (Not Owner)'}
                </button>
            </div>
        `;

        dashboard.appendChild(card);

        // Bind Publish Event for verified owners
        const pubBtn = card.querySelector(`#pub-${item.id}`);
        const selectEl = card.querySelector(`#select-${item.id}`);

        if (item.isOwned) {
            pubBtn.addEventListener('click', async () => {
                if (!signer) {
                    showToast('Please connect your MetaMask wallet first.', 'error');
                    return;
                }

                const selectedVariant = parseInt(selectEl.value);
                try {
                    pubBtn.disabled = true;
                    pubBtn.textContent = 'Confirming in MetaMask...';

                    const connectedContract = new ethers.Contract(WEB3_CONFIG.contractAddress, WEB3_CONFIG.abi, signer);
                    const tx = await connectedContract.useControlToken(item.tokenId, selectedVariant);
                    
                    pubBtn.textContent = 'Transaction Pending...';
                    showToast('Transaction submitted. Waiting for block confirmation...', 'success');
                    
                    await tx.wait();
                    showToast(`Successfully updated ${item.name} to Variant ${selectedVariant}!`, 'success');
                    
                    pubBtn.textContent = 'Publish to Blockchain';
                    pubBtn.disabled = false;
                    
                    // Re-fetch live states from chain to reflect updates immediately
                    await initDashboard(userAddress);
                } catch (error) {
                    console.error('Transaction failed:', error);
                    showToast(error.reason || error.message || 'Transaction rejected by user.', 'error');
                    pubBtn.textContent = 'Publish to Blockchain';
                    pubBtn.disabled = false;
                }
            });
        }
    }
}

connectWalletBtn.addEventListener('click', async () => {
    if (typeof window.ethereum === 'undefined') {
        showToast('MetaMask is not installed. Please install MetaMask to connect.', 'error');
        return;
    }

    try {
        connectWalletBtn.textContent = 'Connecting...';
        
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();

        const network = await provider.getNetwork();
        if (Number(network.chainId) !== WEB3_CONFIG.chainId) {
            showToast(`Please switch MetaMask to Ethereum Mainnet (Chain ID: 1)`, 'error');
            connectWalletBtn.textContent = 'Wrong Network';
            return;
        }

        const shortAddr = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
        connectWalletBtn.textContent = shortAddr;
        connectWalletBtn.style.background = 'var(--accent-gold)';
        connectWalletBtn.style.color = '#000';

        showToast(`Connected: ${shortAddr}`, 'success');
        await initDashboard(userAddress);

    } catch (err) {
        console.error('Wallet connection error:', err);
        showToast('Wallet connection failed or was rejected.', 'error');
        connectWalletBtn.textContent = 'Connect Wallet';
    }
});

window.addEventListener('DOMContentLoaded', () => {
    initDashboard(null);
});
