// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftFlow} from "../GiftFlow.sol";

/// @dev 6-decimal mock USDC. Optionally fires a batch of low-level calls (from the token's
/// address) at a target the first time transfer (kind 1) or transferFrom (kind 2) is invoked.
contract MockUSDC {
    error InsufficientBalance();
    error InsufficientAllowance();

    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    address public hookTarget;
    uint8 public hookKind;
    bool public inHook;
    bytes[] internal _calls;
    bool[] internal _ok;
    bytes[] internal _rets;

    function setHook(address target, bytes[] calldata calls, uint8 kind) external {
        hookTarget = target;
        hookKind = kind;
        delete _calls;
        delete _ok;
        delete _rets;
        for (uint256 i; i < calls.length; ++i) {
            _calls.push(calls[i]);
        }
    }

    function hookResults() external view returns (bool[] memory, bytes[] memory) {
        return (_ok, _rets);
    }

    function _hook(uint8 kind) internal {
        if (hookTarget == address(0) || hookKind != kind || inHook || _ok.length != 0) return;
        inHook = true;
        for (uint256 i; i < _calls.length; ++i) {
            (bool ok, bytes memory r) = hookTarget.call(_calls[i]);
            _ok.push(ok);
            _rets.push(r);
        }
        inHook = false;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _hook(1);
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _hook(2);
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @dev Merkle SUM tree builder matching GiftFlow's tagged commitment scheme.
library TreeLib {
    struct Alloc {
        address account;
        uint128 amount;
        bool walletBound;
    }

    struct Tree {
        bytes32[][] h;
        uint256[][] s;
        uint256 depth;
        bytes32 root;
        uint256 total;
    }

    function leaf(uint256 i, address acc, uint256 amt, bool wb) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(0), i, acc, amt, wb));
    }

    function node(bytes32 lh, uint256 ls, bytes32 rh, uint256 rs) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(1), lh, ls, rh, rs));
    }

    function build(Alloc[] memory a) internal pure returns (Tree memory t) {
        uint256 n = a.length;
        require(n > 0, "empty");
        uint256 depth;
        while ((uint256(1) << depth) < n) ++depth;
        t.depth = depth;
        t.h = new bytes32[][](depth + 1);
        t.s = new uint256[][](depth + 1);
        uint256 width = uint256(1) << depth;
        t.h[0] = new bytes32[](width);
        t.s[0] = new uint256[](width);
        for (uint256 i; i < n; ++i) {
            t.h[0][i] = leaf(i, a[i].account, a[i].amount, a[i].walletBound);
            t.s[0][i] = a[i].amount;
        }
        for (uint256 l = 1; l <= depth; ++l) {
            width >>= 1;
            t.h[l] = new bytes32[](width);
            t.s[l] = new uint256[](width);
            for (uint256 j; j < width; ++j) {
                t.h[l][j] = node(t.h[l - 1][2 * j], t.s[l - 1][2 * j], t.h[l - 1][2 * j + 1], t.s[l - 1][2 * j + 1]);
                t.s[l][j] = t.s[l - 1][2 * j] + t.s[l - 1][2 * j + 1];
            }
        }
        t.root = t.h[depth][0];
        t.total = t.s[depth][0];
    }

    function proofFor(Tree memory t, uint256 index) internal pure returns (GiftFlow.ProofNode[] memory p) {
        p = new GiftFlow.ProofNode[](t.depth);
        for (uint256 l; l < t.depth; ++l) {
            uint256 sib = (index >> l) ^ 1;
            p[l] = GiftFlow.ProofNode(t.h[l][sib], uint128(t.s[l][sib]));
        }
    }

    function packed(Alloc[] memory a) internal pure returns (bytes memory out) {
        for (uint256 i; i < a.length; ++i) {
            out = bytes.concat(out, abi.encodePacked(bytes20(a[i].account), a[i].amount, uint8(a[i].walletBound ? 1 : 0)));
        }
    }
}

abstract contract GiftFlowTestBase is Test {
    MockUSDC internal usdc;
    GiftFlow internal gf;

    address internal owner = makeAddr("owner");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    uint256 internal bearerPk = 0xB0B1;
    address internal bearerAddr;

    uint256 internal constant T0 = 1_700_000_000;
    bytes32 internal constant SALT = keccak256("salt");

    function setUp() public virtual {
        vm.warp(T0);
        bearerAddr = vm.addr(bearerPk);
        usdc = new MockUSDC();
        gf = new GiftFlow(IERC20(address(usdc)), owner);
        usdc.mint(creator, 1_000_000_000e6);
        vm.prank(creator);
        usdc.approve(address(gf), type(uint256).max);
    }

    // ---------- helpers ----------

    function _allocs(uint256 n, bool wb) internal pure returns (TreeLib.Alloc[] memory a) {
        a = new TreeLib.Alloc[](n);
        for (uint256 i; i < n; ++i) {
            a[i] = TreeLib.Alloc(address(uint160(0x1000 + i)), uint128((i + 1) * 1e6), wb);
        }
    }

    function _cp(TreeLib.Tree memory t, uint256 n, uint64 start, uint64 dl, bool pub)
        internal
        pure
        returns (GiftFlow.CreateParams memory)
    {
        return GiftFlow.CreateParams(t.root, uint128(t.total), uint32(n), start, dl, pub, SALT);
    }

    function _make(TreeLib.Alloc[] memory a, bool pub, uint64 start, uint64 dl)
        internal
        returns (uint256 id, TreeLib.Tree memory t)
    {
        t = TreeLib.build(a);
        bytes memory data = pub ? TreeLib.packed(a) : bytes("");
        GiftFlow.CreateParams memory p = _cp(t, a.length, start, dl, pub);
        vm.prank(creator);
        id = gf.createCampaign(p, "meta", data);
    }

    function _live(TreeLib.Alloc[] memory a, bool pub) internal returns (uint256 id, TreeLib.Tree memory t) {
        return _make(a, pub, uint64(block.timestamp), uint64(block.timestamp + 7 days));
    }

    function _future(TreeLib.Alloc[] memory a, bool pub) internal returns (uint256 id, TreeLib.Tree memory t) {
        return _make(a, pub, uint64(block.timestamp + 1 days), uint64(block.timestamp + 8 days));
    }

    function _alloc(TreeLib.Alloc[] memory a, uint256 i) internal pure returns (GiftFlow.Allocation memory) {
        return GiftFlow.Allocation(i, a[i].account, a[i].amount, a[i].walletBound);
    }

    function _claim(address who, uint256 id, TreeLib.Alloc[] memory a, TreeLib.Tree memory t, uint256 i) internal {
        GiftFlow.Allocation memory al = _alloc(a, i);
        GiftFlow.ProofNode[] memory pr = TreeLib.proofFor(t, i);
        vm.prank(who);
        gf.claim(id, al, pr, 0, "");
    }

    function _entries(TreeLib.Alloc[] memory a, TreeLib.Tree memory t, uint256[] memory idxs)
        internal
        pure
        returns (GiftFlow.DirectEntry[] memory e)
    {
        e = new GiftFlow.DirectEntry[](idxs.length);
        for (uint256 k; k < idxs.length; ++k) {
            e[k].a = _alloc(a, idxs[k]);
            e[k].proof = TreeLib.proofFor(t, idxs[k]);
        }
    }

    function _idx(uint256 a0) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a0;
    }

    function _idx(uint256 a0, uint256 a1) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a0;
        r[1] = a1;
    }

    function _idx(uint256 a0, uint256 a1, uint256 a2) internal pure returns (uint256[] memory r) {
        r = new uint256[](3);
        r[0] = a0;
        r[1] = a1;
        r[2] = a2;
    }

    function _sig(uint256 pk, uint256 id, uint256 index, address recipient, uint256 dl)
        internal
        view
        returns (bytes memory)
    {
        bytes32 d = gf.claimDigest(id, index, recipient, dl);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }
}
