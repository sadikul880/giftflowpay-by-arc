// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib, MockUSDC} from "./GiftFlow.Base.t.sol";

/// @notice createCampaign + tree-size end-to-end coverage.
contract GiftFlowCreateTest is GiftFlowTestBase {
    function _priv() internal view returns (GiftFlow.CreateParams memory p) {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        p = _cp(TreeLib.build(a), 3, uint64(block.timestamp), uint64(block.timestamp + 7 days), false);
    }

    function _pub(uint256 n)
        internal
        view
        returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t, GiftFlow.CreateParams memory p, bytes memory data)
    {
        a = _allocs(n, true);
        t = TreeLib.build(a);
        p = _cp(t, n, uint64(block.timestamp), uint64(block.timestamp + 7 days), true);
        data = TreeLib.packed(a);
    }

    function _create(GiftFlow.CreateParams memory p, bytes memory data) internal returns (uint256) {
        vm.prank(creator);
        return gf.createCampaign(p, "meta", data);
    }

    function _rv(bytes4 sel, GiftFlow.CreateParams memory p, bytes memory data) internal {
        vm.expectRevert(sel);
        _create(p, data);
    }

    // ---------- happy path / storage / events ----------

    function test_Create_Private_PullsFundsAndStoresState() public {
        uint256 before = usdc.balanceOf(creator);
        (uint256 id, TreeLib.Tree memory t) = _live(_allocs(3, true), false);
        assertEq(id, 1);
        assertEq(gf.campaignCount(), 1);
        assertEq(gf.totalFunded(), 6e6);
        assertEq(usdc.balanceOf(address(gf)), 6e6);
        assertEq(usdc.balanceOf(creator), before - 6e6);

        GiftFlow.Campaign memory c = gf.getCampaign(1);
        assertEq(c.creator, creator);
        assertEq(c.createdAt, T0);
        assertEq(c.startTime, T0);
        assertEq(c.claimDeadline, T0 + 7 days);
        assertEq(c.merkleRoot, t.root);
        assertEq(c.totalAllocation, 6e6);
        assertEq(c.claimed, 0);
        assertEq(c.refunded, 0);
        assertEq(c.recipientCount, 3);
        assertEq(c.claimedCount, 0);
        assertFalse(c.isPublic);
        assertFalse(c.cancelled);
    }

    function test_Create_Public_StoresIsPublicAndIncrementsIds() public {
        (uint256 id1,) = _live(_allocs(3, true), true);
        (uint256 id2,) = _live(_allocs(2, true), false);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertTrue(gf.getCampaign(1).isPublic);
        assertFalse(gf.getCampaign(2).isPublic);
        assertEq(gf.totalFunded(), 9e6);
        assertEq(usdc.balanceOf(address(gf)), 9e6);
    }

    function test_Create_Public_EmitsBothEventsInOrder() public {
        (, TreeLib.Tree memory t, GiftFlow.CreateParams memory p, bytes memory data) = _pub(3);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.CampaignCreated(1, creator, t.root, 6e6, 3, uint64(T0), uint64(T0 + 7 days), true, SALT, "meta");
        vm.expectEmit(true, false, false, true, address(gf));
        emit GiftFlow.RecipientsPublished(1, data);
        _create(p, data);
    }

    function test_Create_Private_EmitsOnlyCampaignCreated() public {
        GiftFlow.CreateParams memory p = _priv();
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.CampaignCreated(1, creator, p.merkleRoot, 6e6, 3, uint64(T0), uint64(T0 + 7 days), false, SALT, "meta");
        vm.recordLogs();
        _create(p, "");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 fromGf;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(gf)) ++fromGf;
        }
        assertEq(fromGf, 1);
    }

    function test_Create_TotalEqualsRecipientCountAndEqualsMaxAreAllowed() public {
        GiftFlow.CreateParams memory p = _priv();
        p.totalAllocation = 3;
        assertEq(_create(p, ""), 1);
        p.totalAllocation = 1_000_000e6;
        assertEq(_create(p, ""), 2);
    }

    // ---------- sizes: build -> create (public + private) -> claim every index ----------

    function _fullFlow(uint256 n, bool pub) internal {
        TreeLib.Alloc[] memory a = _allocs(n, true);
        (uint256 id, TreeLib.Tree memory t) = _live(a, pub);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += a[i].amount;
        }
        assertEq(t.total, total);
        assertEq(gf.getCampaign(id).totalAllocation, total);
        for (uint256 i; i < n; ++i) {
            uint256 before = usdc.balanceOf(a[i].account);
            _claim(a[i].account, id, a, t, i);
            assertEq(usdc.balanceOf(a[i].account) - before, a[i].amount);
            assertTrue(gf.isClaimed(id, i));
        }
        GiftFlow.Campaign memory c = gf.getCampaign(id);
        assertEq(c.claimed, total);
        assertEq(c.claimedCount, n);
        assertEq(usdc.balanceOf(address(gf)), 0);
    }

    function _sizes() internal pure returns (uint256[6] memory) {
        return [uint256(1), 2, 3, 5, 8, 100];
    }

    function test_TreeSizes_Private_AllIndicesClaimable() public {
        uint256[6] memory s = _sizes();
        for (uint256 k; k < s.length; ++k) {
            _fullFlow(s[k], false);
        }
    }

    function test_TreeSizes_Public_AllIndicesClaimable() public {
        uint256[6] memory s = _sizes();
        for (uint256 k; k < s.length; ++k) {
            _fullFlow(s[k], true);
        }
    }

    function test_TreeSizes_Public_Max1000Recipients() public {
        (,, GiftFlow.CreateParams memory p, bytes memory data) = _pub(1000);
        assertEq(_create(p, data), 1);
    }

    // ---------- recipient count / totals ----------

    function test_RevertWhen_ZeroRoot() public {
        GiftFlow.CreateParams memory p = _priv();
        p.merkleRoot = bytes32(0);
        _rv(GiftFlow.InvalidMerkleRoot.selector, p, "");
    }

    function test_RevertWhen_RecipientCountZero() public {
        GiftFlow.CreateParams memory p = _priv();
        p.recipientCount = 0;
        _rv(GiftFlow.InvalidRecipientCount.selector, p, "");
    }

    function test_RecipientCount_PrivateBounds() public {
        GiftFlow.CreateParams memory p = _priv();
        p.merkleRoot = keccak256("arbitrary");
        p.totalAllocation = 10_000e6;
        p.recipientCount = 10_000;
        assertEq(_create(p, ""), 1);
        p.recipientCount = 10_001;
        _rv(GiftFlow.InvalidRecipientCount.selector, p, "");
    }

    function test_RevertWhen_PublicRecipientCountOver1000() public {
        GiftFlow.CreateParams memory p = _priv();
        p.isPublic = true;
        p.recipientCount = 1001;
        p.totalAllocation = 1001e6;
        _rv(GiftFlow.InvalidRecipientCount.selector, p, "");
    }

    function test_RevertWhen_TotalSmallerThanRecipientCount() public {
        GiftFlow.CreateParams memory p = _priv();
        p.totalAllocation = 2;
        _rv(GiftFlow.InvalidTotalAllocation.selector, p, "");
    }

    function test_RevertWhen_TotalAboveMax() public {
        GiftFlow.CreateParams memory p = _priv();
        p.totalAllocation = uint128(gf.maxTotalAllocation() + 1);
        _rv(GiftFlow.InvalidTotalAllocation.selector, p, "");
    }

    // ---------- schedule ----------

    function test_StartInPast_IsNormalisedToNow() public {
        GiftFlow.CreateParams memory p = _priv();
        p.startTime = 1;
        uint256 id = _create(p, "");
        assertEq(gf.getCampaign(id).startTime, block.timestamp);
        p.startTime = 0;
        id = _create(p, "");
        assertEq(gf.getCampaign(id).startTime, block.timestamp);
    }

    function test_StartTooFar_Reverts_ExactMaxOk() public {
        GiftFlow.CreateParams memory p = _priv();
        p.startTime = uint64(block.timestamp + 365 days);
        p.claimDeadline = p.startTime + 1 days;
        uint256 id = _create(p, "");
        assertEq(gf.getCampaign(id).startTime, T0 + 365 days);
        p.startTime += 1;
        p.claimDeadline = p.startTime + 1 days;
        _rv(GiftFlow.InvalidStartTime.selector, p, "");
    }

    function test_ClaimWindow_TooShort() public {
        GiftFlow.CreateParams memory p = _priv();
        p.claimDeadline = p.startTime + 1 hours - 1;
        _rv(GiftFlow.InvalidClaimWindow.selector, p, "");
        p.claimDeadline = p.startTime;
        _rv(GiftFlow.InvalidClaimWindow.selector, p, "");
        p.claimDeadline = uint64(block.timestamp - 1);
        _rv(GiftFlow.InvalidClaimWindow.selector, p, "");
    }

    function test_ClaimWindow_TooLong_AndBoundariesOk() public {
        GiftFlow.CreateParams memory p = _priv();
        p.claimDeadline = p.startTime + 730 days + 1;
        _rv(GiftFlow.InvalidClaimWindow.selector, p, "");
        p.claimDeadline = p.startTime + 730 days;
        assertEq(_create(p, ""), 1);
        p.claimDeadline = p.startTime + 1 hours;
        assertEq(_create(p, ""), 2);
    }

    function test_ClaimWindow_MeasuredFromNormalisedStart() public {
        GiftFlow.CreateParams memory p = _priv();
        p.startTime = 1; // normalised to now; window from now must be >= 1h
        p.claimDeadline = uint64(block.timestamp + 1 hours - 1);
        _rv(GiftFlow.InvalidClaimWindow.selector, p, "");
    }

    function test_Metadata_TooLong_AndMaxOk() public {
        GiftFlow.CreateParams memory p = _priv();
        vm.prank(creator);
        gf.createCampaign(p, string(new bytes(2048)), "");
        vm.expectRevert(GiftFlow.MetadataTooLong.selector);
        vm.prank(creator);
        gf.createCampaign(p, string(new bytes(2049)), "");
    }

    // ---------- published data ----------

    function test_RevertWhen_PrivateWithData() public {
        GiftFlow.CreateParams memory p = _priv();
        _rv(GiftFlow.InvalidRecipientsData.selector, p, hex"00");
    }

    function test_RevertWhen_PublicDataLengthWrong() public {
        (,, GiftFlow.CreateParams memory p, bytes memory data) = _pub(3);
        _rv(GiftFlow.InvalidRecipientsData.selector, p, "");
        _rv(GiftFlow.InvalidRecipientsData.selector, p, bytes.concat(data, new bytes(37)));
        bytes memory shortData = new bytes(data.length - 1);
        for (uint256 i; i < shortData.length; ++i) {
            shortData[i] = data[i];
        }
        _rv(GiftFlow.InvalidRecipientsData.selector, p, shortData);
    }

    function test_RevertWhen_PublicDataDiffersFromRoot() public {
        (TreeLib.Alloc[] memory a,, GiftFlow.CreateParams memory p,) = _pub(3);
        a[1].amount += 1; // same root + total claimed, different row data
        a[2].amount -= 1;
        _rv(GiftFlow.PublishedDataMismatch.selector, p, TreeLib.packed(a));
    }

    function test_RevertWhen_PublicTotalDoesNotMatchRows() public {
        (,, GiftFlow.CreateParams memory p, bytes memory data) = _pub(3);
        p.totalAllocation += 1;
        _rv(GiftFlow.PublishedDataMismatch.selector, p, data);
    }

    function test_RevertWhen_PublicRootCommitsTamperedSum() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t,, bytes memory data) = _pub(2);
        uint256 s0 = a[0].amount;
        uint256 s1 = a[1].amount + 1; // inflated sum committed in root
        bytes32 root = TreeLib.node(t.h[0][0], s0, t.h[0][1], s1);
        GiftFlow.CreateParams memory p =
            GiftFlow.CreateParams(root, uint128(s0 + s1), 2, uint64(T0), uint64(T0 + 7 days), true, SALT);
        _rv(GiftFlow.PublishedDataMismatch.selector, p, data);
    }

    function test_RevertWhen_PublicRootHasNonEmptyPaddingHash() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t,, bytes memory data) = _pub(3);
        bytes32 n01 = TreeLib.node(t.h[0][0], a[0].amount, t.h[0][1], a[1].amount);
        bytes32 n23 = TreeLib.node(t.h[0][2], a[2].amount, keccak256("pad"), 0);
        bytes32 root = TreeLib.node(n01, uint256(a[0].amount) + a[1].amount, n23, a[2].amount);
        GiftFlow.CreateParams memory p =
            GiftFlow.CreateParams(root, uint128(t.total), 3, uint64(T0), uint64(T0 + 7 days), true, SALT);
        _rv(GiftFlow.PublishedDataMismatch.selector, p, data);
    }

    function test_RevertWhen_PublicRootHasNonZeroPaddingSum() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t,, bytes memory data) = _pub(3);
        bytes32 n01 = TreeLib.node(t.h[0][0], a[0].amount, t.h[0][1], a[1].amount);
        bytes32 n23 = TreeLib.node(t.h[0][2], a[2].amount, bytes32(0), 5);
        bytes32 root = TreeLib.node(n01, uint256(a[0].amount) + a[1].amount, n23, uint256(a[2].amount) + 5);
        GiftFlow.CreateParams memory p =
            GiftFlow.CreateParams(root, uint128(t.total + 5), 3, uint64(T0), uint64(T0 + 7 days), true, SALT);
        _rv(GiftFlow.PublishedDataMismatch.selector, p, data);
    }

    function test_RevertWhen_PublicRowMalformed() public {
        (,, GiftFlow.CreateParams memory p, bytes memory data) = _pub(3);
        bytes memory bad = bytes.concat(data);
        bad[36] = 0x02; // walletBound > 1
        _rv(GiftFlow.InvalidRecipientsData.selector, p, bad);

        bad = bytes.concat(data);
        for (uint256 j; j < 20; ++j) {
            bad[37 + j] = 0; // zero account in row 1
        }
        _rv(GiftFlow.InvalidRecipientsData.selector, p, bad);

        bad = bytes.concat(data);
        for (uint256 j = 20; j < 36; ++j) {
            bad[74 + j] = 0; // zero amount in row 2
        }
        _rv(GiftFlow.InvalidRecipientsData.selector, p, bad);
    }

    // ---------- funds & pause ----------

    function test_RevertWhen_InsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.prank(poor);
        usdc.approve(address(gf), type(uint256).max);
        GiftFlow.CreateParams memory p = _priv();
        vm.expectRevert(MockUSDC.InsufficientBalance.selector);
        vm.prank(poor);
        gf.createCampaign(p, "m", "");
    }

    function test_RevertWhen_InsufficientAllowance() public {
        address rich = makeAddr("rich");
        usdc.mint(rich, 100e6);
        GiftFlow.CreateParams memory p = _priv();
        vm.expectRevert(MockUSDC.InsufficientAllowance.selector);
        vm.prank(rich);
        gf.createCampaign(p, "m", "");

        vm.prank(rich);
        usdc.approve(address(gf), 6e6 - 1); // one unit short
        vm.expectRevert(MockUSDC.InsufficientAllowance.selector);
        vm.prank(rich);
        gf.createCampaign(p, "m", "");
    }

    function test_RevertWhen_Paused_ThenWorksAfterUnpause() public {
        vm.prank(owner);
        gf.pause();
        _rv(Pausable.EnforcedPause.selector, _priv(), "");
        vm.prank(owner);
        gf.unpause();
        assertEq(_create(_priv(), ""), 1);
    }
}
