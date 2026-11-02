// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

/// @notice Wallet-bound claim path + malicious-root containment.
contract GiftFlowClaimTest is GiftFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        (id,) = _live(_allocs(5, true), true);
    }

    function _ta() internal pure returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) {
        a = _allocs(5, true);
        t = TreeLib.build(a);
    }

    function _claimWith(address who, uint256 cid, GiftFlow.Allocation memory al, GiftFlow.ProofNode[] memory pr)
        internal
    {
        vm.prank(who);
        gf.claim(cid, al, pr, 0, "");
    }

    // ---------- success ----------

    function test_Claim_WalletBound_Success() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        address acct = a[2].account;
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Claimed(id, acct, 2, acct, 3e6, false);
        _claim(acct, id, a, t, 2);

        assertEq(usdc.balanceOf(acct), 3e6);
        assertTrue(gf.isClaimed(id, 2));
        assertFalse(gf.isClaimed(id, 1));
        GiftFlow.Campaign memory c = gf.getCampaign(id);
        assertEq(c.claimed, 3e6);
        assertEq(c.claimedCount, 1);
        assertEq(gf.totalClaimed(), 3e6);
        assertEq(usdc.balanceOf(address(gf)), 15e6 - 3e6);
    }

    function test_Claim_AnyOrder_AllIndices() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        for (uint256 k = 5; k > 0; --k) {
            _claim(a[k - 1].account, id, a, t, k - 1);
        }
        assertEq(gf.getCampaign(id).claimed, 15e6);
        assertEq(usdc.balanceOf(address(gf)), 0);
    }

    // ---------- reverts ----------

    function test_RevertWhen_WrongWallet() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        vm.expectRevert(GiftFlow.WalletMismatch.selector);
        _claim(stranger, id, a, t, 2);
        // another committed account cannot claim someone else's allocation either
        vm.expectRevert(GiftFlow.WalletMismatch.selector);
        _claim(a[1].account, id, a, t, 2);
    }

    function test_RevertWhen_DoubleClaim() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        _claim(a[0].account, id, a, t, 0);
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _claim(a[0].account, id, a, t, 0);
        assertEq(usdc.balanceOf(a[0].account), 1e6);
    }

    function test_RevertWhen_BadProofHashOrSum() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, 2);
        pr[0].hash = bytes32(uint256(pr[0].hash) ^ 1);
        GiftFlow.Allocation memory al = _alloc(a, 2);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, pr);

        pr = TreeLib.proofFor(t, 2);
        pr[1].sum += 1;
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, pr);
    }

    function test_RevertWhen_WrongAmount() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, 2);
        GiftFlow.Allocation memory al = _alloc(a, 2);
        al.amount += 1;
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, pr);
        al.amount = 0;
        vm.expectRevert(GiftFlow.InvalidAmount.selector);
        _claimWith(a[2].account, id, al, pr);
    }

    function test_RevertWhen_WrongOrOutOfRangeIndex() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, 2);
        GiftFlow.Allocation memory al = _alloc(a, 2);
        al.index = 3;
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, pr);
        al.index = 5; // == recipientCount
        vm.expectRevert(GiftFlow.InvalidIndex.selector);
        _claimWith(a[2].account, id, al, pr);
        al.index = type(uint256).max;
        vm.expectRevert(GiftFlow.InvalidIndex.selector);
        _claimWith(a[2].account, id, al, pr);
    }

    function test_RevertWhen_ZeroAccount() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.Allocation memory al = _alloc(a, 2);
        al.account = address(0);
        vm.expectRevert(GiftFlow.ZeroAddress.selector);
        _claimWith(address(0xBEEF), id, al, TreeLib.proofFor(t, 2));
    }

    function test_RevertWhen_WrongProofLength() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        GiftFlow.Allocation memory al = _alloc(a, 2);
        GiftFlow.ProofNode[] memory full = TreeLib.proofFor(t, 2);
        assertEq(full.length, 3);

        GiftFlow.ProofNode[] memory longer = new GiftFlow.ProofNode[](4);
        for (uint256 i; i < 3; ++i) {
            longer[i] = full[i];
        }
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, longer);

        GiftFlow.ProofNode[] memory shorter = new GiftFlow.ProofNode[](2);
        shorter[0] = full[0];
        shorter[1] = full[1];
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, shorter);

        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, al, new GiftFlow.ProofNode[](0));
    }

    function test_RevertWhen_ProofFromAnotherCampaign() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        TreeLib.Alloc[] memory a2 = _allocs(5, true);
        a2[0].amount += 1e6;
        (uint256 id2, TreeLib.Tree memory t2) = _live(a2, false);
        assertTrue(t2.root != t.root);

        // campaign 2's proof for index 2 used against campaign 1
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id, _alloc(a, 2), TreeLib.proofFor(t2, 2));
        // campaign 1's proof used against campaign 2
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, id2, _alloc(a2, 2), TreeLib.proofFor(t, 2));
        // each works in its own campaign
        _claim(a[2].account, id, a, t, 2);
        _claim(a2[2].account, id2, a2, t2, 2);
    }

    function test_RevertWhen_BeforeStart_ThenOkAtStart() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        (uint256 fid, TreeLib.Tree memory t) = _future(a, false);
        vm.expectRevert(GiftFlow.ClaimsNotStarted.selector);
        _claim(a[0].account, fid, a, t, 0);
        vm.warp(T0 + 1 days - 1);
        vm.expectRevert(GiftFlow.ClaimsNotStarted.selector);
        _claim(a[0].account, fid, a, t, 0);
        vm.warp(T0 + 1 days);
        _claim(a[0].account, fid, a, t, 0);
        assertEq(usdc.balanceOf(a[0].account), 1e6);
    }

    function test_Deadline_LastSecondOk_AtDeadlineAndAfterRevert() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        vm.warp(T0 + 7 days - 1);
        _claim(a[0].account, id, a, t, 0);
        vm.warp(T0 + 7 days);
        vm.expectRevert(GiftFlow.ClaimWindowClosed.selector);
        _claim(a[1].account, id, a, t, 1);
        vm.warp(T0 + 30 days);
        vm.expectRevert(GiftFlow.ClaimWindowClosed.selector);
        _claim(a[1].account, id, a, t, 1);
    }

    function test_RevertWhen_Cancelled() public {
        TreeLib.Alloc[] memory a = _allocs(3, true);
        (uint256 fid, TreeLib.Tree memory t) = _future(a, false);
        vm.prank(creator);
        gf.cancelCampaign(fid);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        _claim(a[0].account, fid, a, t, 0);
        vm.warp(T0 + 2 days);
        vm.expectRevert(GiftFlow.CampaignIsCancelled.selector);
        _claim(a[0].account, fid, a, t, 0);
    }

    function test_RevertWhen_Paused_ThenWorksAfterUnpause() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        vm.prank(owner);
        gf.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _claim(a[0].account, id, a, t, 0);
        vm.prank(owner);
        gf.unpause();
        _claim(a[0].account, id, a, t, 0);
    }

    function test_RevertWhen_CampaignNotFound() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _ta();
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        _claim(a[0].account, 99, a, t, 0);
        vm.expectRevert(GiftFlow.CampaignNotFound.selector);
        _claim(a[0].account, 0, a, t, 0);
    }

    // ---------- malicious organizer root ----------

    function _manualPrivate(bytes32 root, uint256 total) internal returns (uint256 cid) {
        GiftFlow.CreateParams memory p =
            GiftFlow.CreateParams(root, uint128(total), 4, uint64(T0), uint64(T0 + 7 days), false, SALT);
        vm.prank(creator);
        cid = gf.createCampaign(p, "evil", "");
    }

    function test_MaliciousRoot_UnderstatedSubtreeSum_CannotExceedTotal() public {
        TreeLib.Alloc[] memory a = _allocs(4, true);
        for (uint256 i; i < 4; ++i) {
            a[i].amount = 50e6;
        }
        TreeLib.Tree memory t = TreeLib.build(a); // honest nodes: h[1][0] = L, h[1][1] = R (true sum 100 each)
        // Organizer commits only 100 total but R really holds 100 more: declare R's sum as 0.
        bytes32 root = TreeLib.node(t.h[1][0], 100e6, t.h[1][1], 0);
        uint256 cid = _manualPrivate(root, 100e6);
        uint256 balBefore = usdc.balanceOf(address(gf));

        // Left leaves carry a consistent path (leaf + sibling leaf + R@0) and can be claimed.
        GiftFlow.ProofNode[] memory p0 = new GiftFlow.ProofNode[](2);
        p0[0] = GiftFlow.ProofNode(t.h[0][1], 50e6);
        p0[1] = GiftFlow.ProofNode(t.h[1][1], 0);
        _claimWith(a[0].account, cid, _alloc(a, 0), p0);
        GiftFlow.ProofNode[] memory p1 = new GiftFlow.ProofNode[](2);
        p1[0] = GiftFlow.ProofNode(t.h[0][0], 50e6);
        p1[1] = GiftFlow.ProofNode(t.h[1][1], 0);
        _claimWith(a[1].account, cid, _alloc(a, 1), p1);
        assertEq(gf.getCampaign(cid).claimed, 100e6);

        // Right leaves cannot be proven against the lie, with either the true or the declared sibling sum.
        GiftFlow.ProofNode[] memory p2 = new GiftFlow.ProofNode[](2);
        p2[0] = GiftFlow.ProofNode(t.h[0][3], 50e6);
        p2[1] = GiftFlow.ProofNode(t.h[1][0], 100e6);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, cid, _alloc(a, 2), p2);
        p2[1] = GiftFlow.ProofNode(t.h[1][0], 0);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[2].account, cid, _alloc(a, 2), p2);
        GiftFlow.ProofNode[] memory p3 = new GiftFlow.ProofNode[](2);
        p3[0] = GiftFlow.ProofNode(t.h[0][2], 50e6);
        p3[1] = GiftFlow.ProofNode(t.h[1][0], 100e6);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claimWith(a[3].account, cid, _alloc(a, 3), p3);

        GiftFlow.Campaign memory c = gf.getCampaign(cid);
        assertLe(c.claimed, c.totalAllocation);
        assertEq(balBefore - usdc.balanceOf(address(gf)), 100e6);
        assertEq(usdc.balanceOf(address(gf)), balBefore - 100e6);
    }

    function test_MaliciousRoot_InconsistentInternalSums_NothingClaimable() public {
        TreeLib.Alloc[] memory a = _allocs(4, true);
        for (uint256 i; i < 4; ++i) {
            a[i].amount = 50e6;
        }
        TreeLib.Tree memory t = TreeLib.build(a);
        // Both subtrees committed at 50 although each holds 100 (total 100 vs real 200).
        bytes32 root = TreeLib.node(t.h[1][0], 50e6, t.h[1][1], 50e6);
        uint256 cid = _manualPrivate(root, 100e6);
        for (uint256 i; i < 4; ++i) {
            GiftFlow.ProofNode[] memory pr = new GiftFlow.ProofNode[](2);
            pr[0] = GiftFlow.ProofNode(t.h[0][i ^ 1], 50e6);
            pr[1] = GiftFlow.ProofNode(t.h[1][(i >> 1) ^ 1], 50e6);
            vm.expectRevert(GiftFlow.InvalidProof.selector);
            _claimWith(a[i].account, cid, _alloc(a, i), pr);
            pr[1].sum = 100e6;
            vm.expectRevert(GiftFlow.InvalidProof.selector);
            _claimWith(a[i].account, cid, _alloc(a, i), pr);
        }
        assertEq(gf.getCampaign(cid).claimed, 0);
    }

    function test_MaliciousRoot_LeafAmountsAboveTotal_Rejected() public {
        // Single leaf worth more than the funded total: amount != total => proof invalid.
        TreeLib.Alloc[] memory a = _allocs(1, true);
        a[0].amount = 10e6;
        TreeLib.Tree memory t = TreeLib.build(a);
        GiftFlow.CreateParams memory p =
            GiftFlow.CreateParams(t.root, 5e6, 1, uint64(T0), uint64(T0 + 7 days), false, SALT);
        vm.prank(creator);
        uint256 cid = gf.createCampaign(p, "", "");
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        _claim(a[0].account, cid, a, t, 0);
    }
}
