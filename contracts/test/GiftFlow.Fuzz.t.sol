// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

contract GiftFlowFuzzTest is GiftFlowTestBase {
    function _fuzzAllocs(uint256 n, uint256 seed) internal view returns (TreeLib.Alloc[] memory a) {
        a = new TreeLib.Alloc[](n);
        for (uint256 i; i < n; ++i) {
            uint256 amt = (uint256(keccak256(abi.encode(seed, i))) % 10_000e6) + 1;
            a[i] = TreeLib.Alloc(address(uint160(0x1000 + i)), uint128(amt), true);
        }
    }

    function testFuzz_CreateClaimAll_ConservesFunds(uint8 nRaw, uint256 seed, bool pub) public {
        uint256 n = bound(nRaw, 1, 40);
        TreeLib.Alloc[] memory a = _fuzzAllocs(n, seed);
        uint256 creatorBefore = usdc.balanceOf(creator);
        (uint256 id, TreeLib.Tree memory t) = _live(a, pub);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += a[i].amount;
        }
        assertEq(t.total, total);
        assertEq(usdc.balanceOf(creator), creatorBefore - total);
        assertEq(usdc.balanceOf(address(gf)), total);
        for (uint256 i; i < n; ++i) {
            _claim(a[i].account, id, a, t, i);
            assertEq(usdc.balanceOf(a[i].account), a[i].amount);
        }
        assertEq(usdc.balanceOf(address(gf)), 0);
        assertEq(gf.getCampaign(id).claimed, total);
        assertEq(gf.totalClaimed(), total);
    }

    function testFuzz_RefundEqualsUnclaimed(uint8 nRaw, uint256 seed, uint256 mask) public {
        uint256 n = bound(nRaw, 1, 30);
        TreeLib.Alloc[] memory a = _fuzzAllocs(n, seed);
        (uint256 id, TreeLib.Tree memory t) = _live(a, false);
        uint256 total;
        uint256 claimedSum;
        for (uint256 i; i < n; ++i) {
            total += a[i].amount;
            if ((mask >> i) & 1 == 1) {
                _claim(a[i].account, id, a, t, i);
                claimedSum += a[i].amount;
            }
        }
        vm.warp(T0 + 7 days);
        assertEq(gf.refundable(id), total - claimedSum);
        uint256 before = usdc.balanceOf(creator);
        if (total == claimedSum) {
            vm.expectRevert(GiftFlow.NothingToRefund.selector);
            vm.prank(creator);
            gf.refund(id);
        } else {
            vm.prank(creator);
            gf.refund(id);
            assertEq(usdc.balanceOf(creator) - before, total - claimedSum);
        }
        assertEq(usdc.balanceOf(address(gf)), 0);
    }

    function testFuzz_ValidWindows_StoredAndEnforced(uint256 startOff, uint256 window) public {
        startOff = bound(startOff, 0, 365 days);
        window = bound(window, 1 hours, 730 days);
        TreeLib.Alloc[] memory a = _allocs(2, true);
        uint64 start = uint64(T0 + startOff);
        uint64 dl = uint64(uint256(start) + window);
        (uint256 id, TreeLib.Tree memory t) = _make(a, false, start, dl);
        GiftFlow.Campaign memory c = gf.getCampaign(id);
        assertEq(c.startTime, start);
        assertEq(c.claimDeadline, dl);

        if (startOff > 0) {
            vm.warp(start - 1);
            vm.expectRevert(GiftFlow.ClaimsNotStarted.selector);
            _claim(a[0].account, id, a, t, 0);
        }
        vm.warp(dl - 1);
        _claim(a[0].account, id, a, t, 0);
        vm.warp(dl);
        vm.expectRevert(GiftFlow.ClaimWindowClosed.selector);
        _claim(a[1].account, id, a, t, 1);
        vm.prank(creator);
        gf.refund(id);
    }

    function testFuzz_InvalidWindows_Revert(uint256 startOff, uint256 window, bool tooLong) public {
        startOff = bound(startOff, 0, 365 days);
        window = tooLong ? bound(window, 730 days + 1, 5000 days) : bound(window, 0, 1 hours - 1);
        TreeLib.Alloc[] memory a = _allocs(2, true);
        TreeLib.Tree memory t = TreeLib.build(a);
        uint64 start = uint64(T0 + startOff);
        GiftFlow.CreateParams memory p = _cp(t, 2, start, uint64(uint256(start) + window), false);
        vm.expectRevert(GiftFlow.InvalidClaimWindow.selector);
        vm.prank(creator);
        gf.createCampaign(p, "", "");
    }

    function testFuzz_PastStart_NormalisedToNow(uint64 start) public {
        start = uint64(bound(start, 0, T0));
        TreeLib.Tree memory t = TreeLib.build(_allocs(2, true));
        GiftFlow.CreateParams memory p = _cp(t, 2, start, uint64(T0 + 1 days), false);
        vm.prank(creator);
        uint256 id = gf.createCampaign(p, "", "");
        assertEq(gf.getCampaign(id).startTime, T0);
    }

    function testFuzz_StartTooFar_Reverts(uint256 off) public {
        off = bound(off, 365 days + 1, 3650 days);
        TreeLib.Tree memory t = TreeLib.build(_allocs(2, true));
        uint64 start = uint64(T0 + off);
        GiftFlow.CreateParams memory p = _cp(t, 2, start, start + 1 days, false);
        vm.expectRevert(GiftFlow.InvalidStartTime.selector);
        vm.prank(creator);
        gf.createCampaign(p, "", "");
    }

    function testFuzz_TotalAndCountBounds(uint256 total, uint256 count) public {
        count = bound(count, 1, 10_000);
        total = bound(total, 0, 2_000_000e6);
        GiftFlow.CreateParams memory p = GiftFlow.CreateParams(
            keccak256("root"), uint128(total), uint32(count), uint64(T0), uint64(T0 + 1 days), false, SALT
        );
        uint256 before = usdc.balanceOf(address(gf));
        if (total < count || total > gf.maxTotalAllocation()) {
            vm.expectRevert(GiftFlow.InvalidTotalAllocation.selector);
            vm.prank(creator);
            gf.createCampaign(p, "", "");
        } else {
            vm.prank(creator);
            gf.createCampaign(p, "", "");
            assertEq(usdc.balanceOf(address(gf)) - before, total);
        }
    }

    function testFuzz_SetMaxTotalAllocation(uint256 v) public {
        vm.prank(owner);
        if (v == 0 || v > 100_000_000e6) {
            vm.expectRevert(GiftFlow.InvalidMaxTotalAllocation.selector);
            gf.setMaxTotalAllocation(v);
        } else {
            gf.setMaxTotalAllocation(v);
            assertEq(gf.maxTotalAllocation(), v);
        }
    }

    function testFuzz_Bearer_RandomSignatureNeverClaims(bytes calldata sig, uint256 dlOff) public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        a[1] = TreeLib.Alloc(bearerAddr, 2e6, false);
        (uint256 id, TreeLib.Tree memory t) = _live(a, false);
        GiftFlow.Allocation memory al = _alloc(a, 1);
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, 1);
        uint256 dl = block.timestamp + bound(dlOff, 0, 365 days);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        vm.prank(alice);
        gf.claim(id, al, pr, dl, sig);
    }

    // ---------- bitmap across 256-bit word boundaries ----------

    function testFuzz_Bitmap_OnlyClaimedIndexIsMarked(uint256 idx) public {
        idx = bound(idx, 0, 299);
        TreeLib.Alloc[] memory a = _allocs(300, true);
        (uint256 id, TreeLib.Tree memory t) = _live(a, false);
        _claim(a[idx].account, id, a, t, idx);
        assertTrue(gf.isClaimed(id, idx));
        if (idx > 0) assertFalse(gf.isClaimed(id, idx - 1));
        if (idx < 299) assertFalse(gf.isClaimed(id, idx + 1));
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _claim(a[idx].account, id, a, t, idx);
    }

    function test_Bitmap_WordBoundaries() public {
        TreeLib.Alloc[] memory a = _allocs(300, true);
        (uint256 id, TreeLib.Tree memory t) = _live(a, false);
        uint256[4] memory ks = [uint256(0), 255, 256, 299];
        for (uint256 k; k < 4; ++k) {
            _claim(a[ks[k]].account, id, a, t, ks[k]);
        }
        for (uint256 i; i < 300; ++i) {
            bool expected = (i == 0 || i == 255 || i == 256 || i == 299);
            assertEq(gf.isClaimed(id, i), expected);
        }
        assertEq(gf.getCampaign(id).claimedCount, 4);
    }
}
