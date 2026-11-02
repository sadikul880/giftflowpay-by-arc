// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

contract GiftFlowDistributeTest is GiftFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        (id,) = _live(_allocs(5, true), true);
    }

    function _ta() internal pure returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) {
        a = _allocs(5, true);
        t = TreeLib.build(a);
    }

    function _dist(address who, uint256 cid, GiftFlow.DirectEntry[] memory e) internal {
        vm.prank(who);
        gf.distribute(cid, e);
    }

    function test_Distribute_PaysAccountsDirectly_EmitsDirectTrue() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0, 2, 4));
        uint256 creatorBal = usdc.balanceOf(creator);

        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Claimed(id, a[0].account, 0, a[0].account, 1e6, true);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Claimed(id, a[2].account, 2, a[2].account, 3e6, true);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Claimed(id, a[4].account, 4, a[4].account, 5e6, true);
        _dist(creator, id, e);

        assertEq(usdc.balanceOf(a[0].account), 1e6);
        assertEq(usdc.balanceOf(a[2].account), 3e6);
        assertEq(usdc.balanceOf(a[4].account), 5e6);
        assertEq(usdc.balanceOf(a[1].account), 0);
        assertEq(usdc.balanceOf(creator), creatorBal);
        assertTrue(gf.isClaimed(id, 0) && gf.isClaimed(id, 2) && gf.isClaimed(id, 4));
        assertFalse(gf.isClaimed(id, 1));
        GiftFlow.Campaign memory c = gf.getCampaign(id);
        assertEq(c.claimed, 9e6);
        assertEq(c.claimedCount, 3);
        assertEq(gf.totalClaimed(), 9e6);
    }

    function test_Distribute_RemainingClaimableByRecipientsAfter() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _dist(creator, id, _entries(a, t, _idx(0, 1)));
        _claim(a[2].account, id, a, t, 2);
        assertEq(gf.getCampaign(id).claimedCount, 3);
    }

    function test_Distribute_Max100Batch() public {
        TreeLib.Alloc[] memory a = _allocs(100, true);
        (uint256 cid, TreeLib.Tree memory t) = _live(a, false);
        uint256[] memory idxs = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            idxs[i] = i;
        }
        _dist(creator, cid, _entries(a, t, idxs));
        assertEq(gf.getCampaign(cid).claimedCount, 100);
        assertEq(gf.getCampaign(cid).claimed, 5050e6);
    }

    function test_RevertWhen_NotCreator() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0));
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        _dist(stranger, id, e);
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        _dist(owner, id, e);
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        _dist(a[0].account, id, e);
    }

    function test_RevertWhen_BearerEntry() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        a[1] = TreeLib.Alloc(bearerAddr, 2e6, false);
        (uint256 cid, TreeLib.Tree memory t) = _live(a, true);
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0, 1));
        vm.expectRevert(GiftFlow.DirectRequiresWalletBound.selector);
        _dist(creator, cid, e);
        assertFalse(gf.isClaimed(cid, 0)); // whole batch reverted
        assertEq(usdc.balanceOf(a[0].account), 0);
    }

    function test_RevertWhen_BatchSizeZeroOrAbove100() public {
        vm.expectRevert(GiftFlow.InvalidBatchSize.selector);
        _dist(creator, id, new GiftFlow.DirectEntry[](0));
        vm.expectRevert(GiftFlow.InvalidBatchSize.selector);
        _dist(creator, id, new GiftFlow.DirectEntry[](101));
    }

    function test_RevertWhen_OneBadEntry_WholeBatchReverts() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0, 1, 3));
        e[2].proof[0].hash = bytes32(uint256(e[2].proof[0].hash) ^ 1);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _dist(creator, id, e);
        for (uint256 i; i < 5; ++i) {
            assertFalse(gf.isClaimed(id, i));
            assertEq(usdc.balanceOf(a[i].account), 0);
        }
        assertEq(gf.getCampaign(id).claimed, 0);
        assertEq(usdc.balanceOf(address(gf)), 15e6);
    }

    function test_RevertWhen_BadAmountOrIndexInBatch() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0, 1));
        e[1].a.amount += 1;
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _dist(creator, id, e);
        e = _entries(a, t, _idx(0, 1));
        e[1].a.index = 5;
        vm.expectRevert(GiftFlow.InvalidIndex.selector);
        _dist(creator, id, e);
    }

    function test_RevertWhen_EntryAlreadyClaimed() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _claim(a[1].account, id, a, t, 1);
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0, 1));
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _dist(creator, id, e);
        assertFalse(gf.isClaimed(id, 0));

        e = _entries(a, t, _idx(2, 2));
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector); // duplicate inside one batch
        _dist(creator, id, e);
        assertFalse(gf.isClaimed(id, 2));
    }

    function test_RevertWhen_AlreadyDistributed_ThenClaim() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _dist(creator, id, _entries(a, t, _idx(0)));
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _claim(a[0].account, id, a, t, 0);
    }

    function test_RevertWhen_BeforeStartOrAfterDeadline() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        (uint256 fid, TreeLib.Tree memory t) = _future(a, false);
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0));
        vm.expectRevert(GiftFlow.ClaimsNotStarted.selector);
        _dist(creator, fid, e);
        vm.warp(T0 + 8 days);
        vm.expectRevert(GiftFlow.ClaimWindowClosed.selector);
        _dist(creator, fid, e);
    }

    function test_RevertWhen_CancelledPausedOrMissing() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        (uint256 fid, TreeLib.Tree memory t) = _future(a, false);
        GiftFlow.DirectEntry[] memory e = _entries(a, t, _idx(0));
        vm.prank(creator);
        gf.cancelCampaign(fid);
        vm.warp(T0 + 2 days);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        _dist(creator, fid, e);

        (TreeLib.Alloc[] memory a1, TreeLib.Tree memory t1) = _ta();
        vm.prank(owner);
        gf.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _dist(creator, id, _entries(a1, t1, _idx(0)));
        vm.prank(owner);
        gf.unpause();

        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        _dist(creator, 77, e);
    }
}
