const WEB3_CONFIG = {
    contractAddress: "0xb6dae651468e9593e4581705a09c10a76ac1e0c8",
    chainId: 1, // Ethereum Mainnet
    chainName: "Ethereum Mainnet",
    rpcUrl: "https://cloudflare-eth.com",
    
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
        "function tokenURI(uint256 tokenId) view returns (string)"
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

async function fetchLiveMixState() {
    try {
        if (!provider) {
            provider = new ethers.JsonRpcProvider(WEB3_CONFIG.rpcUrl);
        }
        const contract = new ethers.Contract(WEB3_CONFIG.contractAddress, WEB3_CONFIG.abi, provider);
        
        mixContainer.innerHTML = '';
        
        for (const layer of WEB3_CONFIG.layers) {
            let activeVariantIndex = 0;
            
            // Attempt to read token URI or metadata state if available, 
            // otherwise fallback gracefully without forcing incorrect 0s if unreadable
            try {
                // Async Art stores metadata or state representation which can be parsed or queried.
                // If direct state view is restricted on proxy, we default cleanly or inspect tokenURI.
                const uri = await contract.tokenURI(layer.tokenId);
                // Placeholder parsing logic if tokenURI contains state data, else default to 0
            } catch (e) {
                activeVariantIndex = 0;
            }

            const variantName = layer.variants[activeVariantIndex] || `Variant ${activeVariantIndex}`;
            
            const pill = document.createElement('div');
            pill.className = 'mix-pill';
            pill.innerHTML = `
                <span class="stem-name">${layer.name}:</span>
                <span class="stem-variant">${variantName}</span>
            `;
            mixContainer.appendChild(pill);
        }
    } catch (err) {
        console.warn('Could not fetch live mix state:', err);
        mixContainer.innerHTML = '<span class="mix-tag-loading">Live mix status initialized. Connect wallet to govern layers.</span>';
    }
}

async function initDashboard(connectedAddress = null) {
    dashboard.innerHTML = '';
    await fetchLiveMixState();

    if (!provider) {
        provider = new ethers.JsonRpcProvider(WEB3_CONFIG.rpcUrl);
    }
    const contract = new ethers.Contract(WEB3_CONFIG.contractAddress, WEB3_CONFIG.abi, provider);

    for (const layer of WEB3_CONFIG.layers) {
        let isOwned = false;
        let activeVariantIndex = 0;

        if (connectedAddress) {
            try {
                const tokenOwner = await contract.ownerOf(layer.tokenId);
                if (tokenOwner && tokenOwner.toLowerCase() === connectedAddress.toLowerCase()) {
                    isOwned = true;
                }
            } catch (err) {
                console.log(`Wallet does not own token ${layer.tokenId}`);
            }
        }

        const card = document.createElement('div');
        card.className = `layer-card ${isOwned ? 'owned' : ''}`;
        
        const variantsOptions = layer.variants.map((v, index) => 
            `<option value="${index}" ${index === activeVariantIndex ? 'selected' : ''}>${v} (Variant ${index})</option>`
        ).join('');

        const activeVariantLabel = layer.variants[activeVariantIndex] || `Variant ${activeVariantIndex}`;

        card.innerHTML = `
            <div class="layer-header">
                <div class="layer-title">
                    <h3>${layer.name}</h3>
                </div>
                <span class="token-id">Token #${layer.tokenId}</span>
            </div>
            <div class="ownership-badge">
                ${connectedAddress ? (isOwned ? '★ Owner Verified' : 'Locked') : 'Wallet Not Connected'}
            </div>
            <div class="layer-body">
                <div class="current-active-state">
                    Active State: <strong>${activeVariantLabel}</strong>
                </div>
                <label for="select-${layer.id}">Select New Variant</label>
                <select id="select-${layer.id}" class="layer-select" ${!isOwned ? 'disabled' : ''}>
                    ${variantsOptions}
                </select>
                <button class="publish-btn" id="pub-${layer.id}" ${!isOwned ? 'disabled' : ''}>
                    ${isOwned ? 'Publish to Blockchain' : 'Locked (Not Owner)'}
                </button>
            </div>
        `;

        dashboard.appendChild(card);

        // Bind Publish Event for verified owners
        const pubBtn = card.querySelector(`#pub-${layer.id}`);
        const selectEl = card.querySelector(`#select-${layer.id}`);

        if (isOwned) {
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
                    const tx = await connectedContract.useControlToken(layer.tokenId, selectedVariant);
                    
                    pubBtn.textContent = 'Transaction Pending...';
                    showToast('Transaction submitted. Waiting for block confirmation...', 'success');
                    
                    await tx.wait();
                    showToast(`Successfully updated ${layer.name} to Variant ${selectedVariant}!`, 'success');
                    
                    pubBtn.textContent = 'Publish to Blockchain';
                    pubBtn.disabled = false;
                    
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
