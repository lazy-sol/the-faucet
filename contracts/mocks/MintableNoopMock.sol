// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @title Mintable No-op Mock
 *
 * @dev Simulates mint(address,uint256) interface, does nothing
 *
 * @author Basil Gorin
 */
contract MintableNoopMock {
	/// @dev emitted in `mint`
	event MintLogged(address indexed to, uint256 value);

	/// @dev does nothing, but logs the execution
	function mint(address to, uint256 value) public {
		// log the event
		emit MintLogged(to, value);
	}
}
