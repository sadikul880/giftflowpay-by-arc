// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title GiftFlow
/// @notice Fully funded, Merkle-authorized USDC campaigns with event-based history.
/// @dev Intended for standard, non-fee-on-transfer, six-decimal USDC on Arc Testnet.
/// The constructor selects the token; the owner cannot withdraw campaign funds.
contract GiftFlow is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    struct Campaign {
        address creator;
        uint64 createdAt;
        uint64 startTime;
        uint64 claimDeadline;
        bytes32 merkleRoot;
        uint128 totalAllocation;
        uint128 claimed;
        uint128 refunded;
        uint32 recipientCount;
        uint32 claimedCount;
        bool isPublic;
        bool cancelled;
    }

    struct CreateParams {
        bytes32 merkleRoot;
        uint128 totalAllocation;
        uint32 recipientCount;
        uint64 startTime;
        uint64 claimDeadline;
        bool isPublic;
        bytes32 salt;
    }

    struct Allocation {
        uint256 index;
        address account;
        uint128 amount;
        bool walletBound;
    }

    struct ProofNode {
        bytes32 hash;
        uint128 sum;
    }

    struct DirectEntry {
        Allocation a;
        ProofNode[] proof;
    }

    IERC20 public immutable USDC;
    uint256 public immutable DEPLOY_BLOCK;

    uint256 internal constant LEAF_TAG = 0;
    uint256 internal constant NODE_TAG = 1;
    uint256 public constant MAX_RECIPIENTS = 10_000;
    uint256 public constant MAX_PUBLIC_RECIPIENTS = 1000;
    uint256 public constant MIN_CLAIM_WINDOW = 1 hours;
    uint256 public constant MAX_CLAIM_WINDOW = 730 days;
    uint256 public constant MAX_START_DELAY = 365 days;
    uint256 public constant MAX_METADATA_BYTES = 2048;
    uint256 public constant PUBLISHED_ROW_BYTES = 37;
    uint256 public constant MAX_BATCH = 100;
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(uint256 campaignId,uint256 index,address recipient,uint256 deadline)"
    );

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitmap;
    uint256 public campaignCount;
    uint256 public totalFunded;
    uint256 public totalClaimed;
    uint256 public totalRefunded;
    uint256 public maxTotalAllocation = 1_000_000e6;

    error ZeroAddress();
    error RenounceDisabled();
    error InvalidMerkleRoot();
    error InvalidRecipientCount();
    error InvalidTotalAllocation();
    error InvalidStartTime();
    error InvalidClaimWindow();
    error MetadataTooLong();
    error InvalidRecipientsData();
    error PublishedDataMismatch();
    error CampaignNotFound();
    error NotCampaignCreator();
    error CampaignIsCancelled();
    error ClaimsNotStarted();
    error ClaimWindowClosed();
    error InvalidIndex();
    error InvalidAmount();
    error AlreadyClaimed();
    error InvalidProof();
    error WalletMismatch();
    error SignatureExpired();
    error InvalidSignature();
    error AllocationExceeded();
    error InvalidBatchSize();
    error DirectRequiresWalletBound();
    error RefundNotAvailable();
    error NothingToRefund();
    error CancellationNotAllowed();
    error InvalidMaxTotalAllocation();

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        bytes32 merkleRoot,
        uint256 totalAllocation,
        uint32 recipientCount,
        uint64 startTime,
        uint64 claimDeadline,
        bool isPublic,
        bytes32 salt,
        string metadata
    );
    event RecipientsPublished(uint256 indexed campaignId, bytes data);
    event Claimed(
        uint256 indexed campaignId,
        address indexed recipient,
        uint256 index,
        address account,
        uint256 amount,
        bool direct
    );
    event Refunded(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event CampaignCancelled(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event MaxTotalAllocationUpdated(uint256 previousValue, uint256 newValue);

    /// @notice Initializes the token, two-step ownership, and GiftFlow v1 signing domain.
    /// @param usdc The six-decimal USDC token, never a hardcoded address.
    /// @param initialOwner The initial administrator; Ownable rejects the zero address.
    constructor(IERC20 usdc, address initialOwner) Ownable(initialOwner) EIP712("GiftFlow", "1") {
        if (address(usdc) == address(0)) revert ZeroAddress();
        USDC = usdc;
        DEPLOY_BLOCK = block.number;
    }

    /// @notice Creates and atomically funds a campaign using the caller's USDC allowance.
    /// @dev Published rows are bytes20 account | uint128 amount | uint8 walletBound.
    /// Row position is the allocation index. Public campaigns authenticate the complete
    /// sum tree and total against the published rows, including zero-valued padding.
    /// Private campaigns' sum-tree integrity cannot be authenticated onchain.
    /// @param p Campaign commitment, schedule, visibility, and event-only salt.
    /// @param metadata Event-only metadata, limited by its UTF-8 byte length.
    /// @param recipientsData Packed rows for public campaigns; empty for private campaigns.
    /// @return id The newly assigned campaign ID, starting at one.
    function createCampaign(
        CreateParams calldata p,
        string calldata metadata,
        bytes calldata recipientsData
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        if (p.merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (
            p.recipientCount == 0
                || p.recipientCount > (p.isPublic ? MAX_PUBLIC_RECIPIENTS : MAX_RECIPIENTS)
        ) revert InvalidRecipientCount();
        if (p.totalAllocation < p.recipientCount || p.totalAllocation > maxTotalAllocation) {
            revert InvalidTotalAllocation();
        }
        uint256 start = p.startTime < block.timestamp ? block.timestamp : uint256(p.startTime);
        if (start > block.timestamp + MAX_START_DELAY || start > type(uint64).max) {
            revert InvalidStartTime();
        }
        if (p.claimDeadline <= start) revert InvalidClaimWindow();
        uint256 window = uint256(p.claimDeadline) - start;
        if (window < MIN_CLAIM_WINDOW || window > MAX_CLAIM_WINDOW) revert InvalidClaimWindow();
        if (bytes(metadata).length > MAX_METADATA_BYTES) revert MetadataTooLong();
        if (p.isPublic) {
            if (recipientsData.length != uint256(p.recipientCount) * PUBLISHED_ROW_BYTES) {
                revert InvalidRecipientsData();
            }
            (bytes32 root, uint256 sum) = _publishedRoot(recipientsData, p.recipientCount);
            if (root != p.merkleRoot || sum != p.totalAllocation) revert PublishedDataMismatch();
        } else if (recipientsData.length != 0) {
            revert InvalidRecipientsData();
        }

        id = ++campaignCount;
        campaigns[id] = Campaign({
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            startTime: uint64(start),
            claimDeadline: p.claimDeadline,
            merkleRoot: p.merkleRoot,
            totalAllocation: p.totalAllocation,
            claimed: 0,
            refunded: 0,
            recipientCount: p.recipientCount,
            claimedCount: 0,
            isPublic: p.isPublic,
            cancelled: false
        });
        totalFunded += p.totalAllocation;
        USDC.safeTransferFrom(msg.sender, address(this), p.totalAllocation);

        _emitCampaignCreated(id, p.salt, metadata);
        if (p.isPublic) emit RecipientsPublished(id, recipientsData);
    }

    /// @notice Claims an allocation, always paying the caller.
    /// @dev Wallet-bound allocations ignore signature fields. Bearer allocations require
    /// an EIP-712 signature by the claim key, binding this campaign, index, caller and deadline.
    /// The bitmap consumes the allocation exactly once regardless of signature reuse.
    /// @param campaignId The campaign to claim from.
    /// @param a The committed allocation; its amount is in USDC base units.
    /// @param proof Merkle sum tree siblings, bottom to top, ordered by allocation index bits.
    /// @param sigDeadline Inclusive signature expiry for bearer claims.
    /// @param signature ECDSA signature by a.account for a bearer claim.
    function claim(
        uint256 campaignId,
        Allocation calldata a,
        ProofNode[] calldata proof,
        uint256 sigDeadline,
        bytes calldata signature
    ) external whenNotPaused nonReentrant {
        Campaign storage c = _campaign(campaignId);
        _requireClaimWindow(c);
        _validateAllocation(campaignId, c, a, proof);
        if (a.walletBound) {
            if (msg.sender != a.account) revert WalletMismatch();
        } else {
            if (block.timestamp > sigDeadline) revert SignatureExpired();
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(
                claimDigest(campaignId, a.index, msg.sender, sigDeadline), signature
            );
            if (err != ECDSA.RecoverError.NoError || signer == address(0) || signer != a.account) {
                revert InvalidSignature();
            }
        }
        _settle(campaignId, c, a, msg.sender, false);
    }

    /// @notice Lets a campaign creator push wallet-bound allocations to their committed wallets.
    /// @dev One to MAX_BATCH entries; any invalid entry reverts the entire batch.
    /// @param campaignId The campaign to distribute from.
    /// @param entries Allocations and their individual Merkle sum tree proofs.
    function distribute(uint256 campaignId, DirectEntry[] calldata entries)
        external
        whenNotPaused
        nonReentrant
    {
        Campaign storage c = _campaign(campaignId);
        _requireCreator(c);
        _requireClaimWindow(c);
        if (entries.length == 0 || entries.length > MAX_BATCH) revert InvalidBatchSize();
        for (uint256 i; i < entries.length; ++i) {
            DirectEntry calldata entry = entries[i];
            if (!entry.a.walletBound) revert DirectRequiresWalletBound();
            _validateAllocation(campaignId, c, entry.a, entry.proof);
            _settle(campaignId, c, entry.a, entry.a.account, true);
        }
    }

    /// @notice Returns a campaign's remaining allocation to its creator after expiry.
    /// @dev Available while paused. A zero remainder, including a repeat refund, reverts.
    /// @param campaignId The expired campaign to refund.
    function refund(uint256 campaignId) external nonReentrant {
        Campaign storage c = _campaign(campaignId);
        _requireCreator(c);
        if (c.cancelled) revert CampaignIsCancelled();
        if (block.timestamp < c.claimDeadline) revert RefundNotAvailable();
        uint256 amount = uint256(c.totalAllocation) - c.claimed - c.refunded;
        if (amount == 0) revert NothingToRefund();
        c.refunded += uint128(amount);
        totalRefunded += amount;
        USDC.safeTransfer(c.creator, amount);
        emit Refunded(campaignId, c.creator, amount);
    }

    /// @notice Cancels a campaign strictly before its start and returns all funding to its creator.
    /// @dev Available while paused; no allocation can have been claimed before startTime.
    /// @param campaignId The future campaign to cancel.
    function cancelCampaign(uint256 campaignId) external nonReentrant {
        Campaign storage c = _campaign(campaignId);
        _requireCreator(c);
        if (c.cancelled) revert CampaignIsCancelled();
        if (block.timestamp >= c.startTime) revert CancellationNotAllowed();
        uint256 amount = c.totalAllocation;
        c.cancelled = true;
        c.refunded = c.totalAllocation;
        totalRefunded += amount;
        USDC.safeTransfer(c.creator, amount);
        emit CampaignCancelled(campaignId, c.creator, amount);
    }

    /// @notice Returns all stored fields of an existing campaign.
    /// @param campaignId The campaign ID; nonexistent campaigns revert CampaignNotFound.
    /// @return The campaign state.
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaign(campaignId);
    }

    /// @notice Checks the consumed-allocation bitmap; unset or nonexistent indices return false.
    /// @param campaignId The campaign ID.
    /// @param index The zero-based allocation index.
    /// @return Whether this allocation has been claimed or directly distributed.
    function isClaimed(uint256 campaignId, uint256 index) public view returns (bool) {
        return (claimedBitmap[campaignId][index / 256] & (uint256(1) << (index % 256))) != 0;
    }

    /// @notice Returns what the creator could refund now, or zero if not yet eligible.
    /// @param campaignId An existing campaign ID; nonexistent campaigns revert CampaignNotFound.
    /// @return The remaining amount, zero for cancelled or already-refunded campaigns.
    function refundable(uint256 campaignId) external view returns (uint256) {
        Campaign storage c = _campaign(campaignId);
        if (c.cancelled || block.timestamp < c.claimDeadline) return 0;
        return uint256(c.totalAllocation) - c.claimed - c.refunded;
    }

    /// @notice Computes the EIP-712 digest a bearer claim key must sign.
    /// @dev Does not require an existing campaign. The domain binds chain ID and this contract.
    /// @param campaignId The authorized campaign ID.
    /// @param index The authorized allocation index.
    /// @param recipient The wallet authorized to submit the claim and receive USDC.
    /// @param sigDeadline Inclusive expiry, encoded as the Claim type's deadline field.
    /// @return The typed-data digest, not an Ethereum personal-message hash.
    function claimDigest(uint256 campaignId, uint256 index, address recipient, uint256 sigDeadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, campaignId, index, recipient, sigDeadline)));
    }

    /// @notice Pauses campaign creation, claims and direct distribution; owner only.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes campaign creation, claims and direct distribution; owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sets the allocation cap for future campaigns only; owner only.
    /// @param value A positive cap no greater than 100,000,000 USDC, in six-decimal units.
    function setMaxTotalAllocation(uint256 value) external onlyOwner {
        if (value == 0 || value > 100_000_000e6) revert InvalidMaxTotalAllocation();
        uint256 previousValue = maxTotalAllocation;
        maxTotalAllocation = value;
        emit MaxTotalAllocationUpdated(previousValue, value);
    }

    /// @notice Ownership renunciation is permanently disabled; two-step transfers remain available.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function _campaign(uint256 campaignId) internal view returns (Campaign storage c) {
        c = campaigns[campaignId];
        if (c.creator == address(0)) revert CampaignNotFound();
    }

    function _requireCreator(Campaign storage c) internal view {
        if (msg.sender != c.creator) revert NotCampaignCreator();
    }

    function _requireClaimWindow(Campaign storage c) internal view {
        if (c.cancelled) revert CampaignIsCancelled();
        if (block.timestamp < c.startTime) revert ClaimsNotStarted();
        if (block.timestamp >= c.claimDeadline) revert ClaimWindowClosed();
    }

    function _validateAllocation(
        uint256 campaignId,
        Campaign storage c,
        Allocation calldata a,
        ProofNode[] calldata proof
    ) internal view {
        if (a.index >= c.recipientCount) revert InvalidIndex();
        if (a.amount == 0) revert InvalidAmount();
        if (a.account == address(0)) revert ZeroAddress();
        if (isClaimed(campaignId, a.index)) revert AlreadyClaimed();
        if (proof.length != _depth(c.recipientCount)) revert InvalidProof();
        // Leaf hash: keccak256(abi.encode(uint256(0), index, account, uint256(amount), walletBound)).
        // Pad to a power of two with (bytes32(0), 0) leaves; hash empty parents normally.
        bytes32 hash = keccak256(abi.encode(LEAF_TAG, a.index, a.account, uint256(a.amount), a.walletBound));
        uint256 sum = uint256(a.amount);
        for (uint256 i; i < proof.length; ++i) {
            ProofNode calldata sibling = proof[i];
            if (((a.index >> i) & 1) == 0) {
                hash = keccak256(abi.encode(NODE_TAG, hash, sum, sibling.hash, uint256(sibling.sum)));
            } else {
                hash = keccak256(abi.encode(NODE_TAG, sibling.hash, uint256(sibling.sum), hash, sum));
            }
            sum += uint256(sibling.sum);
        }
        if (hash != c.merkleRoot || sum != c.totalAllocation) revert InvalidProof();
    }

    function _publishedRoot(bytes calldata data, uint256 count) internal pure returns (bytes32 root, uint256 sum) {
        uint256 width = uint256(1) << _depth(count);
        bytes32[] memory hashes = new bytes32[](width);
        uint256[] memory sums = new uint256[](width);
        for (uint256 i; i < count; ++i) {
            uint256 offset = i * PUBLISHED_ROW_BYTES;
            address account = address(bytes20(data[offset:offset + 20]));
            uint128 amount = uint128(bytes16(data[offset + 20:offset + 36]));
            uint8 walletBound = uint8(data[offset + 36]);
            if (account == address(0) || amount == 0 || walletBound > 1) revert InvalidRecipientsData();
            hashes[i] = keccak256(abi.encode(LEAF_TAG, i, account, uint256(amount), walletBound == 1));
            sums[i] = uint256(amount);
        }
        while (width > 1) {
            uint256 parentCount = width >> 1;
            for (uint256 i; i < parentCount; ++i) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                hashes[i] = keccak256(abi.encode(NODE_TAG, hashes[left], sums[left], hashes[right], sums[right]));
                sums[i] = sums[left] + sums[right];
            }
            width = parentCount;
        }
        root = hashes[0];
        sum = sums[0];
    }

    function _depth(uint256 recipientCount) internal pure returns (uint256 depth) {
        if (recipientCount <= 1) return 0;
        uint256 remaining = recipientCount - 1;
        while (remaining != 0) {
            ++depth;
            remaining >>= 1;
        }
    }

    function _settle(
        uint256 campaignId,
        Campaign storage c,
        Allocation calldata a,
        address recipient,
        bool direct
    ) internal {
        uint256 nextClaimed = uint256(c.claimed) + a.amount;
        if (nextClaimed > c.totalAllocation) revert AllocationExceeded();
        claimedBitmap[campaignId][a.index / 256] |= uint256(1) << (a.index % 256);
        c.claimed = uint128(nextClaimed);
        ++c.claimedCount;
        totalClaimed += a.amount;
        USDC.safeTransfer(recipient, a.amount);
        emit Claimed(campaignId, recipient, a.index, a.account, a.amount, direct);
    }

    function _emitCampaignCreated(uint256 id, bytes32 salt, string calldata metadata) internal {
        Campaign storage c = campaigns[id];
        emit CampaignCreated(
            id,
            c.creator,
            c.merkleRoot,
            c.totalAllocation,
            c.recipientCount,
            c.startTime,
            c.claimDeadline,
            c.isPublic,
            salt,
            metadata
        );
    }
}
