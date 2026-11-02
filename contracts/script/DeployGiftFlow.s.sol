// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftFlow} from "../GiftFlow.sol";

/// @notice Deploys GiftFlow. All inputs come from the environment so one script serves every network.
/// Required env: USDC_ADDRESS, OWNER_ADDRESS, EXPECTED_CHAIN_ID. Sign with a keystore (`--account`) or hardware wallet.
contract DeployGiftFlow is Script {
    function run() external returns (GiftFlow flow) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        require(block.chainid == vm.envUint("EXPECTED_CHAIN_ID"), "DeployGiftFlow: wrong chain");

        vm.startBroadcast();
        flow = new GiftFlow(IERC20(usdc), owner);
        vm.stopBroadcast();

        console2.log("GiftFlow deployed at", address(flow));
        console2.log("Deploy block", flow.DEPLOY_BLOCK());
    }
}
