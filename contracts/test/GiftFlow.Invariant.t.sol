// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib, MockUSDC} from "./GiftFlow.Base.t.sol";

/// @dev Drives bounded random actions against GiftFlow. Reverting calls are swallowed.
contract GiftFlowHandler is Test {
    GiftFlow public gf;
    MockUSDC public usdc;
    address public creator;
    address public owner;
    uint256 public bearerPk;
    address public bearerAddr;

    uint256 public constant MAXN = 12;
    uint256 public okCreate;
    uint256 public okClaim;
    uint256 public okDistribute;
    uint256 public okCancel;
    uint256 public okRefund;
    mapping(uint256 => TreeLib.Alloc[]) internal allocs;

    constructor(GiftFlow _gf, MockUSDC _usdc, address _creator, address _owner, uint256 _pk) {
        gf = _gf;
        usdc = _usdc;
        creator = _creator;
        owner = _owner;
        bearerPk = _pk;
        bearerAddr = vm.addr(_pk);
    }

    // ---- views used by invariants ----
    function allocLen(uint256 cid) external view returns (uint256) {
        return allocs[cid].length;
    }

    function allocAmount(uint256 cid, uint256 i) external view returns (uint256) {
        return allocs[cid][i].amount;
    }

    function poolAddr(uint256 k) public pure returns (address) {
        return address(uint160(0x1000 + (k % MAXN)));
    }

    function _load(uint256 cid) internal view returns (TreeLib.Alloc[] memory a) {
        uint256 n = allocs[cid].length;
        a = new TreeLib.Alloc[](n);
        for (uint256 i; i < n; ++i) {
            a[i] = allocs[cid][i];
        }
    }

    // ---- actions ----
    function create(uint256 seed, uint256 nRaw, uint256 startDelay, uint256 window) external {
        uint256 n = bound(nRaw, 1, MAXN);
        TreeLib.Alloc[] memory a = new TreeLib.Alloc[](n);
        for (uint256 i; i < n; ++i) {
            uint128 amt = uint128((uint256(keccak256(abi.encode(seed, i))) % 1000e6) + 1);
            bool bearer = i % 3 == 2;
            a[i] = TreeLib.Alloc(bearer ? bearerAddr : poolAddr(i), amt, !bearer);
        }
        TreeLib.Tree memory t = TreeLib.build(a);
        bool pub = seed & 1 == 1;
        uint256 start = block.timestamp + (startDelay % 3 == 0 ? 0 : bound(startDelay, 0, 3 hours));
        uint256 dl = start + bound(window, 1 hours, 5 days);
        GiftFlow.CreateParams memory p = GiftFlow.CreateParams(
            t.root, uint128(t.total), uint32(n), uint64(start), uint64(dl), pub, bytes32(seed)
        );
        bytes memory data = pub ? TreeLib.packed(a) : bytes("");
        vm.prank(creator);
        try gf.createCampaign(p, "h", data) returns (uint256 id) {
            for (uint256 i; i < n; ++i) {
                allocs[id].push(a[i]);
            }
            ++okCreate;
        } catch {}
    }

    function claim(uint256 cSeed, uint256 iSeed, uint256 rSeed) external {
        uint256 count = gf.campaignCount();
        if (count == 0) return;
        uint256 cid = bound(cSeed, count > 2 ? count - 2 : 1, count);
        TreeLib.Alloc[] memory a = _load(cid);
        uint256 i = bound(iSeed, 0, a.length - 1);
        GiftFlow.Allocation memory al = GiftFlow.Allocation(i, a[i].account, a[i].amount, a[i].walletBound);
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(TreeLib.build(a), i);
        address who = a[i].walletBound ? a[i].account : poolAddr(rSeed);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = a[i].walletBound ? bytes("") : _sign(cid, i, who, dl);
        vm.prank(who);
        try gf.claim(cid, al, pr, dl, sig) {
            ++okClaim;
        } catch {}
    }

    function _sign(uint256 cid, uint256 i, address who, uint256 dl) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bearerPk, gf.claimDigest(cid, i, who, dl));
        return abi.encodePacked(r, s, v);
    }

    function distribute(uint256 cSeed, uint256 iSeed) external {
        uint256 count = gf.campaignCount();
        if (count == 0) return;
        uint256 cid = bound(cSeed, count > 2 ? count - 2 : 1, count);
        TreeLib.Alloc[] memory a = _load(cid);
        TreeLib.Tree memory t = TreeLib.build(a);
        uint256 i = bound(iSeed, 0, a.length - 1);
        uint256 j = (i + 1) % a.length;
        uint256 len = i == j ? 1 : 2;
        GiftFlow.DirectEntry[] memory e = new GiftFlow.DirectEntry[](len);
        e[0].a = GiftFlow.Allocation(i, a[i].account, a[i].amount, a[i].walletBound);
        e[0].proof = TreeLib.proofFor(t, i);
        if (len == 2) {
            e[1].a = GiftFlow.Allocation(j, a[j].account, a[j].amount, a[j].walletBound);
            e[1].proof = TreeLib.proofFor(t, j);
        }
        vm.prank(creator);
        try gf.distribute(cid, e) {
            ++okDistribute;
        } catch {}
    }

    function cancel(uint256 cSeed) external {
        uint256 count = gf.campaignCount();
        if (count == 0 || cSeed % 5 != 0) return;
        vm.prank(creator);
        try gf.cancelCampaign(bound(cSeed, count > 2 ? count - 2 : 1, count)) {
            ++okCancel;
        } catch {}
    }

    function refund(uint256 cSeed) external {
        uint256 count = gf.campaignCount();
        if (count == 0) return;
        vm.prank(creator);
        try gf.refund(bound(cSeed, count > 2 ? count - 2 : 1, count)) {
            ++okRefund;
        } catch {}
    }

    function warp(uint256 d) external {
        vm.warp(block.timestamp + bound(d, 0, 1 hours));
    }

    function togglePause(uint256 seed) external {
        if (seed % 16 != 0) return;
        bool isPaused = gf.paused();
        vm.prank(owner);
        if (isPaused) gf.unpause();
        else gf.pause();
    }
}

contract GiftFlowInvariantTest is GiftFlowTestBase {
    GiftFlowHandler internal h;
    uint256 internal initialSupply;

    function setUp() public override {
        super.setUp();
        h = new GiftFlowHandler(gf, usdc, creator, owner, bearerPk);
        initialSupply = usdc.totalSupply();
        bytes4[] memory sels = new bytes4[](7);
        sels[0] = h.create.selector;
        sels[1] = h.claim.selector;
        sels[2] = h.distribute.selector;
        sels[3] = h.cancel.selector;
        sels[4] = h.refund.selector;
        sels[5] = h.warp.selector;
        sels[6] = h.togglePause.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
        targetContract(address(h));
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 200
    function invariant_BalanceEqualsOutstandingAllocations() public view {
        uint256 outstanding;
        uint256 n = gf.campaignCount();
        for (uint256 id = 1; id <= n; ++id) {
            GiftFlow.Campaign memory c = gf.getCampaign(id);
            assertLe(uint256(c.claimed) + c.refunded, c.totalAllocation);
            outstanding += uint256(c.totalAllocation) - c.claimed - c.refunded;
        }
        assertEq(usdc.balanceOf(address(gf)), outstanding);
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 200
    function invariant_TokenConservationAndCounters() public view {
        uint256 held = usdc.balanceOf(address(gf)) + usdc.balanceOf(creator) + usdc.balanceOf(h.bearerAddr());
        for (uint256 k; k < h.MAXN(); ++k) {
            held += usdc.balanceOf(h.poolAddr(k));
        }
        assertEq(held, initialSupply);

        uint256 claimedSum;
        uint256 refundedSum;
        uint256 n = gf.campaignCount();
        for (uint256 id = 1; id <= n; ++id) {
            GiftFlow.Campaign memory c = gf.getCampaign(id);
            claimedSum += c.claimed;
            refundedSum += c.refunded;
        }
        assertEq(gf.totalClaimed(), claimedSum);
        assertEq(gf.totalRefunded(), refundedSum);
        assertEq(gf.totalFunded(), gf.totalClaimed() + gf.totalRefunded() + usdc.balanceOf(address(gf)));
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 200
    function invariant_ClaimedMatchesBitmapAndCommittedAmounts() public view {
        uint256 n = gf.campaignCount();
        for (uint256 id = 1; id <= n; ++id) {
            GiftFlow.Campaign memory c = gf.getCampaign(id);
            uint256 cnt;
            uint256 sum;
            for (uint256 i; i < h.allocLen(id); ++i) {
                if (gf.isClaimed(id, i)) {
                    ++cnt;
                    sum += h.allocAmount(id, i);
                }
            }
            assertEq(cnt, c.claimedCount);
            assertEq(sum, c.claimed);
            assertLe(c.claimed, c.totalAllocation);
            if (c.cancelled) {
                assertEq(c.claimed, 0);
                assertEq(c.refunded, c.totalAllocation);
            }
        }
    }
}
