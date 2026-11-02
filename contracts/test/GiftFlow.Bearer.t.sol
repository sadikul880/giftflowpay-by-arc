// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GiftFlow} from "../GiftFlow.sol";
import {GiftFlowTestBase, TreeLib} from "./GiftFlow.Base.t.sol";

/// @notice Bearer (walletBound=false) claims signed by the claim key.
contract GiftFlowBearerTest is GiftFlowTestBase {
    uint256 internal id;
    uint256 internal constant IDX = 1;
    uint256 internal constant AMT = 2e6;

    function setUp() public override {
        super.setUp();
        (TreeLib.Alloc[] memory a,) = _fx();
        (id,) = _live(a, true);
    }

    function _fx() internal view returns (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) {
        a = _allocs(3, true);
        a[IDX] = TreeLib.Alloc(bearerAddr, uint128(AMT), false);
        t = TreeLib.build(a);
    }

    function _bclaim(address who, uint256 cid, uint256 sigDl, bytes memory sig) internal {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _fx();
        GiftFlow.Allocation memory al = _alloc(a, IDX);
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, IDX);
        vm.prank(who);
        gf.claim(cid, al, pr, sigDl, sig);
    }

    function test_Bearer_Success_PaysSubmitterNotKey() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        vm.expectEmit(true, true, false, true, address(gf));
        emit GiftFlow.Claimed(id, alice, IDX, bearerAddr, AMT, false);
        _bclaim(alice, id, dl, sig);
        assertEq(usdc.balanceOf(alice), AMT);
        assertEq(usdc.balanceOf(bearerAddr), 0);
        assertTrue(gf.isClaimed(id, IDX));
        assertEq(gf.getCampaign(id).claimed, AMT);
    }

    function test_Bearer_SigDeadlineIsInclusive() public {
        uint256 dl = block.timestamp + 100;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        vm.warp(dl);
        _bclaim(alice, id, dl, sig);
        assertEq(usdc.balanceOf(alice), AMT);
    }

    function test_RevertWhen_SigDeadlineExpired() public {
        uint256 dl = block.timestamp + 100;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        vm.warp(dl + 1);
        vm.expectRevert(GiftFlow.SignatureExpired.selector);
        _bclaim(alice, id, dl, sig);
    }

    function test_RevertWhen_SigForDifferentRecipient() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, bob, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, sig);
    }

    function test_RevertWhen_SigForDifferentIndex() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, 0, alice, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, sig);
    }

    function test_RevertWhen_SigForDifferentCampaign() public {
        (TreeLib.Alloc[] memory a,) = _fx();
        (uint256 id2,) = _live(a, false); // identical allocations, different campaign id
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sigForId2 = _sig(bearerPk, id2, IDX, alice, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, sigForId2);
        // and the signature is valid only on its own campaign
        _bclaim(alice, id2, dl, sigForId2);
        assertEq(usdc.balanceOf(alice), AMT);
        assertFalse(gf.isClaimed(id, IDX));
    }

    function test_RevertWhen_SigForDifferentDeadline() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl + 1, sig);
    }

    function test_RevertWhen_SignedByWrongKey() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(0xBAD, id, IDX, alice, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, sig);
    }

    function test_RevertWhen_GarbageSignature() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory junk65 = new bytes(65);
        for (uint256 i; i < 65; ++i) {
            junk65[i] = bytes1(uint8(0xAB));
        }
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, junk65);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, new bytes(65)); // all zero
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, new bytes(64));
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, new bytes(66));
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, "");
        // the key's own address cannot claim without a signature
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(bearerAddr, id, dl, "");
    }

    function test_RevertWhen_FrontRunByOtherWallet_ThenIntendedRecipientStillClaims() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(bob, id, dl, sig); // bob copies alice's tx data
        assertEq(usdc.balanceOf(bob), 0);
        _bclaim(alice, id, dl, sig);
        assertEq(usdc.balanceOf(alice), AMT);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_RevertWhen_BearerReplayedAfterClaim() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        _bclaim(alice, id, dl, sig);
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _bclaim(alice, id, dl, sig);
        bytes memory sig2 = _sig(bearerPk, id, IDX, bob, dl);
        vm.expectRevert(GiftFlow.AlreadyClaimed.selector);
        _bclaim(bob, id, dl, sig2);
    }

    function test_RevertWhen_ChainIdChanged_SignatureNotReplayable() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, IDX, alice, dl);
        bytes32 d1 = gf.claimDigest(id, IDX, alice, dl);
        vm.chainId(999);
        assertTrue(gf.claimDigest(id, IDX, alice, dl) != d1);
        vm.expectRevert(GiftFlow.InvalidSignature.selector);
        _bclaim(alice, id, dl, sig);
        vm.chainId(31337);
        _bclaim(alice, id, dl, sig);
        assertEq(usdc.balanceOf(alice), AMT);
    }

    function test_RevertWhen_WalletBoundFlagFlipped() public {
        (TreeLib.Alloc[] memory a, TreeLib.Tree memory t) = _fx();
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, IDX);
        GiftFlow.Allocation memory al = _alloc(a, IDX);
        al.walletBound = true;
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        vm.prank(bearerAddr);
        gf.claim(id, al, pr, 0, "");

        // wallet-bound entry presented as bearer is also rejected by the commitment
        pr = TreeLib.proofFor(t, 0);
        al = _alloc(a, 0);
        al.walletBound = false;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(bearerPk, id, 0, alice, dl);
        vm.expectRevert(GiftFlow.InvalidProof.selector);
        vm.prank(alice);
        gf.claim(id, al, pr, dl, sig);
    }

    function test_ClaimDigest_MatchesEip712Domain() public view {
        uint256 dl = 12345;
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("GiftFlow"),
                keccak256("1"),
                block.chainid,
                address(gf)
            )
        );
        bytes32 structHash = keccak256(abi.encode(gf.CLAIM_TYPEHASH(), id, IDX, alice, dl));
        assertEq(gf.claimDigest(id, IDX, alice, dl), keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
    }
}
