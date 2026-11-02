// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

/// @notice cancelCampaign + refund + refundable().
contract GiftFlowLifecycleTest is GiftFlowTestBase {
    uint256 internal liveId; // starts now, ends T0 + 7d, 5 recipients, total 15e6
    uint256 internal futId; // starts T0 + 1d, ends T0 + 8d, 3 recipients, total 6e6

    function setUp() public override {
        super.setUp();
        (liveId,) = _live(_allocs(5, true), false);
        (futId,) = _future(_allocs(3, true), true);
    }

    function _ta() internal pure returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) {
        a = _allocs(5, true);
        t = TreeLib.build(a);
    }

    // ---------- cancelCampaign ----------

    function test_Cancel_FullRefund_EmitsAndUpdatesState() public {
        uint256 before = usdc.balanceOf(creator);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.CampaignCancelled(futId, creator, 6e6);
        vm.prank(creator);
        gf.cancelCampaign(futId);

        assertEq(usdc.balanceOf(creator), before + 6e6);
        assertEq(usdc.balanceOf(address(gf)), 15e6);
        GiftFlow.Campaign memory c = gf.getCampaign(futId);
        assertTrue(c.cancelled);
        assertEq(c.refunded, 6e6);
        assertEq(c.claimed, 0);
        assertEq(gf.totalRefunded(), 6e6);
        assertEq(gf.refundable(futId), 0);
    }

    function test_RevertWhen_CancelNotCreator() public {
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        vm.prank(stranger);
        gf.cancelCampaign(futId);
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        vm.prank(owner);
        gf.cancelCampaign(futId);
    }

    function test_RevertWhen_CancelAtOrAfterStart() public {
        vm.expectRevert(GiftFlow.CancellationNotAllowed.selector);
        vm.prank(creator);
        gf.cancelCampaign(liveId); // start == creation time

        vm.warp(T0 + 1 days - 1);
        vm.prank(creator);
        gf.cancelCampaign(futId); // strictly before start is fine
    }

    function test_RevertWhen_CancelAtStartBoundary() public {
        vm.warp(T0 + 1 days);
        vm.expectRevert(GiftFlow.CancellationNotAllowed.selector);
        vm.prank(creator);
        gf.cancelCampaign(futId);
    }

    function test_RevertWhen_DoubleCancel() public {
        vm.prank(creator);
        gf.cancelCampaign(futId);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        vm.prank(creator);
        gf.cancelCampaign(futId);
        assertEq(gf.totalRefunded(), 6e6);
    }

    function test_Cancel_BlocksClaimsAfterStart() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        TreeLib.Tree memory t = TreeLib.build(a);
        vm.prank(creator);
        gf.cancelCampaign(futId);
        vm.warp(T0 + 2 days);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        _claim(a[0].account, futId, a, t, 0);
    }

    function test_Cancel_WorksWhilePaused() public {
        vm.prank(owner);
        gf.pause();
        vm.prank(creator);
        gf.cancelCampaign(futId);
        assertTrue(gf.getCampaign(futId).cancelled);
    }

    function test_RevertWhen_CancelMissingCampaign() public {
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        vm.prank(creator);
        gf.cancelCampaign(55);
    }

    // ---------- refund ----------

    function test_Refund_AfterDeadline_FullAmount() public {
        vm.warp(T0 + 7 days);
        uint256 before = usdc.balanceOf(creator);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Refunded(liveId, creator, 15e6);
        vm.prank(creator);
        gf.refund(liveId);
        assertEq(usdc.balanceOf(creator), before + 15e6);
        assertEq(gf.getCampaign(liveId).refunded, 15e6);
        assertEq(gf.totalRefunded(), 15e6);
        assertEq(usdc.balanceOf(address(gf)), 6e6); // only futId funds remain
    }

    function test_RevertWhen_RefundNotCreator() public {
        vm.warp(T0 + 7 days);
        vm.expectRevert(GiftFlow.NotCampaignCreator.selector);
        vm.prank(stranger);
        gf.refund(liveId);
    }

    function test_RevertWhen_RefundBeforeDeadline_OkExactlyAtDeadline() public {
        vm.warp(T0 + 7 days - 1);
        vm.expectRevert(GiftFlow.RefundNotAvailable.selector);
        vm.prank(creator);
        gf.refund(liveId);
        assertEq(gf.refundable(liveId), 0);
        vm.warp(T0 + 7 days);
        assertEq(gf.refundable(liveId), 15e6);
        vm.prank(creator);
        gf.refund(liveId);
    }

    function test_Refund_AfterPartialClaims_ReturnsOnlyRemainder() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _claim(a[0].account, liveId, a, t, 0);
        _claim(a[3].account, liveId, a, t, 3);
        vm.warp(T0 + 7 days);
        uint256 expected = 15e6 - 1e6 - 4e6;
        assertEq(gf.refundable(liveId), expected);
        uint256 before = usdc.balanceOf(creator);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Refunded(liveId, creator, expected);
        vm.prank(creator);
        gf.refund(liveId);
        assertEq(usdc.balanceOf(creator) - before, expected);
        GiftFlow.Campaign memory c = gf.getCampaign(liveId);
        assertEq(c.claimed + c.refunded, c.totalAllocation);
    }

    function test_RevertWhen_DoubleRefund_NothingToRefund() public {
        vm.warp(T0 + 7 days);
        vm.prank(creator);
        gf.refund(liveId);
        assertEq(gf.refundable(liveId), 0);
        vm.expectRevert(GiftFlow.NothingToRefund.selector);
        vm.prank(creator);
        gf.refund(liveId);
    }

    function test_RevertWhen_RefundOfFullyClaimedCampaign() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        for (uint256 i; i < 5; ++i) {
            _claim(a[i].account, liveId, a, t, i);
        }
        vm.warp(T0 + 7 days);
        assertEq(gf.refundable(liveId), 0);
        vm.expectRevert(GiftFlow.NothingToRefund.selector);
        vm.prank(creator);
        gf.refund(liveId);
    }

    function test_RevertWhen_RefundAfterCancel() public {
        vm.prank(creator);
        gf.cancelCampaign(futId);
        vm.warp(T0 + 30 days);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        vm.prank(creator);
        gf.refund(futId);
        assertEq(gf.refundable(futId), 0);
    }

    function test_Refund_WorksWhilePaused() public {
        vm.warp(T0 + 7 days);
        vm.prank(owner);
        gf.pause();
        vm.prank(creator);
        gf.refund(liveId);
        assertEq(gf.getCampaign(liveId).refunded, 15e6);
    }

    function test_Refundable_ViewValues() public {
        assertEq(gf.refundable(liveId), 0);
        assertEq(gf.refundable(futId), 0);
        vm.warp(T0 + 8 days);
        assertEq(gf.refundable(liveId), 15e6);
        assertEq(gf.refundable(futId), 6e6);
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        gf.refundable(99);
    }

    function test_Refund_MissingCampaign() public {
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        vm.prank(creator);
        gf.refund(99);
    }

    function test_IsClaimed_AndGetCampaign_Nonexistent() public {
        assertFalse(gf.isClaimed(99, 0));
        assertFalse(gf.isClaimed(liveId, 12345));
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        gf.getCampaign(0);
    }
}
