// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

/// @notice Constructor, access control, pause, cap, ownership.
contract GiftFlowAdminTest is GiftFlowTestBase {
    function test_Constructor_SetsTokenOwnerAndDefaults() public {
        assertEq(address(gf.USDC()), address(usdc));
        assertEq(gf.owner(), owner);
        assertEq(gf.pendingOwner(), address(0));
        assertEq(gf.maxTotalAllocation(), 1_000_000e6);
        assertFalse(gf.paused());
        assertEq(gf.campaignCount(), 0);
        GiftFlow g2 = new GiftFlow(IERC20(address(usdc)), owner);
        assertEq(g2.DEPLOY_BLOCK(), block.number);
    }

    function test_Constructor_RevertsOnZeroTokenOrOwner() public {
        vm.expectRevert(GiftFlow.ZeroAddress.selector);
        new GiftFlow(IERC20(address(0)), owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new GiftFlow(IERC20(address(usdc)), address(0));
    }

    // ---------- pause ----------

    function test_Pause_Unpause_OwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gf.pause();

        vm.prank(owner);
        gf.pause();
        assertTrue(gf.paused());

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gf.unpause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator));
        vm.prank(creator);
        gf.unpause();

        vm.prank(owner);
        gf.unpause();
        assertFalse(gf.paused());
    }

    function test_RevertWhen_PauseTwice_OrUnpauseWhenNotPaused() public {
        vm.expectRevert(Pausable.ExpectedPause.selector);
        vm.prank(owner);
        gf.unpause();
        vm.prank(owner);
        gf.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(owner);
        gf.pause();
    }

    // ---------- setMaxTotalAllocation ----------

    function test_SetMax_OwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gf.setMaxTotalAllocation(5e6);
    }

    function test_SetMax_Bounds_AndEvent() public {
        vm.expectRevert(GiftFlow.InvalidMaxTotalAllocation.selector);
        vm.prank(owner);
        gf.setMaxTotalAllocation(0);
        vm.expectRevert(GiftFlow.InvalidMaxTotalAllocation.selector);
        vm.prank(owner);
        gf.setMaxTotalAllocation(100_000_000e6 + 1);

        vm.expectEmit(false, false, false, true, address(gf));
        emit GiftFlow.MaxTotalAllocationUpdated(1_000_000e6, 100_000_000e6);
        vm.prank(owner);
        gf.setMaxTotalAllocation(100_000_000e6);
        assertEq(gf.maxTotalAllocation(), 100_000_000e6);

        vm.expectEmit(false, false, false, true, address(gf));
        emit GiftFlow.MaxTotalAllocationUpdated(100_000_000e6, 1);
        vm.prank(owner);
        gf.setMaxTotalAllocation(1);
        assertEq(gf.maxTotalAllocation(), 1);
    }

    function test_SetMax_AppliesToFutureCampaignsOnly() public {
        (uint256 id,) = _live(_allocs(3, true), false); // 6e6
        vm.prank(owner);
        gf.setMaxTotalAllocation(5e6);
        assertEq(gf.getCampaign(id).totalAllocation, 6e6);

        TreeLib.Tree memory t = TreeLib.build(_allocs(3, true));
        GiftFlow.CreateParams memory p = _cp(t, 3, uint64(T0), uint64(T0 + 7 days), false);
        vm.expectRevert(GiftFlow.InvalidTotalAllocation.selector);
        vm.prank(creator);
        gf.createCampaign(p, "", "");

        // existing campaign is still fully claimable
        TreeLib.Alloc[] memory a = _allocs(3, true);
        _claim(a[2].account, id, a, t, 2);
        assertEq(usdc.balanceOf(a[2].account), 3e6);
    }

    // ---------- ownership ----------

    function test_Ownable2Step_Flow() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gf.transferOwnership(stranger);

        vm.expectEmit(true, true, false, false, address(gf));
        emit Ownable2Step.OwnershipTransferStarted(owner, alice);
        vm.prank(owner);
        gf.transferOwnership(alice);
        assertEq(gf.owner(), owner);
        assertEq(gf.pendingOwner(), alice);

        // pending owner has no powers yet; wrong account cannot accept
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        gf.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gf.acceptOwnership();

        vm.prank(alice);
        gf.acceptOwnership();
        assertEq(gf.owner(), alice);
        assertEq(gf.pendingOwner(), address(0));

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vm.prank(owner);
        gf.pause();
        vm.prank(alice);
        gf.pause();
        assertTrue(gf.paused());
    }

    function test_RenounceOwnership_AlwaysReverts() public {
        vm.expectRevert(GiftFlow.RenounceDisabled.selector);
        vm.prank(owner);
        gf.renounceOwnership();
        vm.expectRevert(GiftFlow.RenounceDisabled.selector);
        vm.prank(stranger);
        gf.renounceOwnership();
        assertEq(gf.owner(), owner);
    }

    function test_OwnerCannotWithdrawCampaignFunds() public {
        _live(_allocs(3, true), false);
        uint256 bal = usdc.balanceOf(address(gf));
        assertEq(bal, 6e6);
        // No owner-only function moves tokens: pause/cap changes leave balance untouched.
        vm.startPrank(owner);
        gf.pause();
        gf.setMaxTotalAllocation(1e6);
        gf.unpause();
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(gf)), bal);
    }
}

/// @notice Malicious-token reentrancy: the token fires claim/distribute/refund/cancel/createCampaign
/// at GiftFlow from inside transfer / transferFrom. Every attempt must hit the ReentrancyGuard.
contract GiftFlowReentrancyTest is GiftFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        (id,) = _live(_allocs(5, true), true);
    }

    function _ta() internal pure returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) {
        a = _allocs(5, true);
        t = TreeLib.build(a);
    }

    function _payloads() internal view returns (bytes[] memory p) {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.CreateParams memory cp = _cp(t, 5, uint64(block.timestamp), uint64(block.timestamp + 7 days), false);
        p = new bytes[](5);
        p[0] = abi.encodeCall(gf.claim, (id, _alloc(a, 2), TreeLib.proofFor(t, 2), 0, bytes("")));
        p[1] = abi.encodeCall(gf.distribute, (id, _entries(a, t, _idx(3))));
        p[2] = abi.encodeCall(gf.refund, (id));
        p[3] = abi.encodeCall(gf.cancelCampaign, (id));
        p[4] = abi.encodeCall(gf.createCampaign, (cp, "re", bytes("")));
    }

    function _arm(uint8 kind) internal {
        usdc.setHook(address(gf), _payloads(), kind);
    }

    function _assertAllBlocked() internal view {
        (bool[] memory ok, bytes[] memory rets) = usdc.hookResults();
        assertEq(ok.length, 5, "hook did not fire");
        for (uint256 i; i < 5; ++i) {
            assertFalse(ok[i], "reentrant call succeeded");
            assertGe(rets[i].length, 4);
            assertEq(bytes4(rets[i]), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        }
    }

    function test_Reentrancy_FromTransfer_DuringClaim() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _arm(1);
        _claim(a[0].account, id, a, t, 0);
        _assertAllBlocked();
        assertEq(gf.getCampaign(id).claimedCount, 1);
        assertEq(gf.totalClaimed(), 1e6);
        assertEq(usdc.balanceOf(address(gf)), 14e6);
    }

    function test_Reentrancy_FromTransfer_DuringDistribute() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _arm(1);
        vm.prank(creator);
        gf.distribute(id, _entries(a, t, _idx(0)));
        _assertAllBlocked();
        assertEq(gf.getCampaign(id).claimedCount, 1);
        assertFalse(gf.isClaimed(id, 2));
        assertFalse(gf.isClaimed(id, 3));
    }

    function test_Reentrancy_FromTransfer_DuringRefund() public {
        _arm(1);
        vm.warp(T0 + 7 days);
        vm.prank(creator);
        gf.refund(id);
        _assertAllBlocked();
        assertEq(gf.totalRefunded(), 15e6);
        assertEq(gf.getCampaign(id).refunded, 15e6);
        assertEq(usdc.balanceOf(address(gf)), 0);
    }

    function test_Reentrancy_FromTransfer_DuringCancel() public {
        (uint256 fid,) = _future(_allocs(3, true), false);
        _arm(1);
        vm.prank(creator);
        gf.cancelCampaign(fid);
        _assertAllBlocked();
        assertEq(gf.totalRefunded(), 6e6);
        assertEq(gf.campaignCount(), 2);
    }

    function test_Reentrancy_FromTransferFrom_DuringCreateCampaign() public {
        _arm(2);
        (uint256 id2,) = _live(_allocs(4, true), false);
        _assertAllBlocked();
        assertEq(id2, 2);
        assertEq(gf.campaignCount(), 2); // the reentrant createCampaign did not add a third
        assertEq(usdc.balanceOf(address(gf)), 15e6 + 10e6);
        assertEq(gf.totalFunded(), 25e6);
    }
}
