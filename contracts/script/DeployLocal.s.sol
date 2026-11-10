// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftFlow} from "../GiftFlow.sol";

/// @notice Six-decimal token with a public mint, for local end-to-end tests only. Never deploy this anywhere public.
contract LocalUSDC is ERC20 {
    constructor() ERC20("Local USDC", "lUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Deploys LocalUSDC and GiftFlow to a local Anvil node (`bun run e2e:local`). Refuses to run on any other chain.
contract DeployLocal is Script {
    function run() external returns (LocalUSDC usdc, GiftFlow flow) {
        require(block.chainid == 31337, "DeployLocal: Anvil only");
        vm.startBroadcast();
        usdc = new LocalUSDC();
        flow = new GiftFlow(IERC20(address(usdc)), msg.sender);
        vm.stopBroadcast();
        console2.log("LocalUSDC", address(usdc));
        console2.log("GiftFlow", address(flow));
    }
}
