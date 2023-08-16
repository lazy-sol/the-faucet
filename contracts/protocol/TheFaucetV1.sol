// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../utils/UpgradeableAccessControl.sol";

/**
 * @title The Faucet
 *
 * @notice The Faucet stores some amount of ETH allowing whitelisted
 *      addresses to consume this ETH with a limited (throttled) speed
 *
 * @notice Designed to be used in test networks like Goerli, Mumbai, etc.
 *
 * @dev In order to get ETH, an account must have `ROLE_FAUCET_USER` permission
 *
 * @dev `ROLE_FAUCET_MANAGER` can set ETH withdrawal limits for the faucet users
 *
 * @author Basil Gorin
 */
contract TheFaucetV1 is UpgradeableAccessControl {
	/**
	 * @dev We divide the time into the epochs of equal size, and make sure
	 *      that no user exceeds the ETH limit set for one epoch
	 *
	 * @dev The epoch length (size) is configurable, but we expect it to be equal
	 *      to 24h in most cases (the default value)
	 *
	 * @dev Epoch length can be updated by the faucet manager `ROLE_FAUCET_MANAGER`
	 *
	 * @dev Epoch length is measured in seconds
	 */
	uint64 public epochLength; // 1 day

	/**
	 * @dev Global ETH limit per epoch defines how much ETH it is allowed
	 *      to be consumed by the user address in one epoch
	 *
	 * @dev This value can have a per user override, set by the faucet manager `ROLE_FAUCET_MANAGER`
	 *
	 * @dev ETH limit per epoch can be updated by the faucet manager `ROLE_FAUCET_MANAGER`
	 *
	 * @dev ETH limit per epoch is measured in wei
	 */
	uint192 public weiLimitPerEpoch; // 10 ether

	/**
	 * @dev Overrides global ETH limit for a user address
	 *
	 * @dev Zero values (non set values) are ignored and
	 *      global ETH limit per epoch (`weiLimitPerEpoch`) is used
	 *
	 * @dev Maps `user address => wei limit per epoch (override)`
	 */
	mapping(address => uint192) public weiLimitPerEpochOverrides;

	/**
	 * @dev Core data structure enabling the throttling mechanism support,
	 *      used in the `user address -> WithdrawalStat struct` mapping
	 *
	 * @dev Records how much wei user address has withdrawn in current epoch,
	 *      and the timestamp of the last withdrawal
	 *
	 * @dev En epoch is a time interval
	 */
	struct WithdrawalStat {
		/**
		 * @dev When user address has withdrawn last time,
		 *      unix timestamp
		 */
		uint64 lastWithdrawalTimestamp;

		/**
		 * @dev How much user address has withdrawn during the current epoch,
		 *      an amount in wei
		 */
		uint192 weiWithdrawn;
	}

	/**
	 * @dev Keeps track of recent withdrawals to enable ETH supply throttling
	 *
	 * @dev Each time the user makes a withdrawal the record is being either
	 *      - created (if record doesn't yet exist)
	 *      - overwritten (if record is old, i.e. belong to the past epoch)
	 *      - cumulatively added (if record is recent, i.e. belongs to the current epoch)
	 *
	 * @dev Maps `user address -> WithdrawalStat struct`
	 */
	mapping(address => WithdrawalStat) public withdrawalStats;

	/**
	 * @dev Grants permission to withdraw ETH (throttled)
	 *
	 * @dev Faucet user is allowed to get ETH via the faucet
	 *
	 * @dev `ROLE_FAUCET_USER` is required to execute:
	 *      `withdrawEth`, `mint`
	 */
	uint256 public constant ROLE_FAUCET_USER = 0x0001_0000;

	/**
	 * @dev Grants permission to change throttling settings:
	 *      `epochLength`, `weiLimitPerEpoch`, `weiLimitPerEpochOverrides`
	 *
	 * @dev Faucet manager is responsible for faucet configuration and managing
	 *      faucet users
	 *
	 * @dev `ROLE_FAUCET_MANAGER` is required to execute:
	 *      `setEpochParams`, `setWeiLimitPerEpochForUser`
	 */
	uint256 public constant ROLE_FAUCET_MANAGER = 0x0002_0000;

	/**
	 * @dev Fired in `setEpochParams`
	 *
	 * @param epochLength new epoch length, seconds
	 * @param weiLimitPerEpoch new ETH limit per epoch, wei
	 */
	event EpochParamsUpdated(uint64 epochLength, uint192 weiLimitPerEpoch);

	/**
	 * @dev Fired in `setWeiLimitPerEpochForUser`
	 *
	 * @param userAddress user address to update the wei limit for
	 * @param weiLimitPerEpoch new ETH limit per epoch for user, wei
	 */
	event WeiLimitUpdated(address indexed userAddress, uint192 weiLimitPerEpoch);

	/**
	 * @dev Fired in `withdrawEth`
	 *
	 * @param to an address to send ETH to
	 * @param value amount of ETH to send, wei
	 */
	event ETHWithdrawn(address indexed to, uint192 value);

	/**
	 * @dev Fired in `mint`
	 *
	 * @param target target smart contract address to invoke function call on
	 * @param to an address to mint tokens to
	 * @param value amount of tokens to mint, wei
	 */
	event MintProxied(address indexed target, address indexed to, uint192 value);

	/**
	 * @dev "Constructor replacement" for upgradeable, must be execute immediately after deployment
	 *      see https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializers
	 */
	function postConstruct() public initializer {
		// execute parent initializer
		_postConstruct(msg.sender);

		// initialize own internal state
		setEpochParams(1 days, 10 ether);
	}

	/**
	 * @notice Returns the actual ETH limit for a particular user address,
	 *      taking into account if it is set for this particular user,
	 *      and global limit value if it is not set for the particular user
	 *
	 * @param _userAddress user address to check the actual ETH limit for
	 * @return ETH limit for a user address, wei
	 */
	function weiLimitPerEpochForUser(address _userAddress) public view returns(uint192) {
		// read the overrides value (if it set)
		uint192 overridden = weiLimitPerEpochOverrides[_userAddress];

		// depending if overrides value is set or no, return the overridden one or global one
		return overridden != 0? overridden: weiLimitPerEpoch;
	}

	/**
	 * @notice Returns the amount of ETH a particular user already withdrawn in the current epoch
	 *
	 * @param _userAddress user address to check the withdrawn ETH for
	 * @return ETH withdrawn in current epoch by the user address, wei
	 */
	function weiWithdrawnInCurrentEpoch(address _userAddress) public view returns(uint192) {
		// read the withdrawal stats storage slot into memory
		WithdrawalStat memory userStat = withdrawalStats[_userAddress];

		// compare last withdrawal epoch number and current epoch number
		// if last withdrawal epoch is in the past
		if(userStat.lastWithdrawalTimestamp / epochLength < block.timestamp / epochLength) {
			// we didn't withdraw anything in current epoch, return zero
			return 0;
		}
		// if last withdrawal epoch is the current one
		else {
			// return the stored wei value
			return userStat.weiWithdrawn;
		}
	}

	/**
	 * @notice Returns the amount of ETH available for a particular user in the current epoch
	 *
	 * @param _userAddress user address to check amount of ETH available for
	 * @return available ETH for a user address available in current epoch
	 */
	function weiLeftInEpochForUser(address _userAddress) public view returns(uint192) {
		// calculate based on the aux functions we have and return
		return weiLimitPerEpochForUser(_userAddress) - weiWithdrawnInCurrentEpoch(_userAddress);
	}

	/**
	 * @dev Restricted access function to update global throttling params,
	 *      updates `epochLength` and `weiLimitPerEpoch` global params
	 *
	 * @param _epochLength new epoch length, seconds, required
	 * @param _weiLimitPerEpoch new ETH limit per epoch, wei
	 */
	function setEpochParams(uint64 _epochLength, uint192 _weiLimitPerEpoch) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_MANAGER), "access denied");

		// verify epoch length is set
		require(_epochLength != 0, "epoch length not set");

		// update the params
		epochLength = _epochLength;
		weiLimitPerEpoch = _weiLimitPerEpoch;

		// emit an event
		emit EpochParamsUpdated(_epochLength, _weiLimitPerEpoch);
	}

	/**
	 * @dev Restricted access function to update throttling params for a user,
	 *      updates `weiLimitPerEpochOverrides` param for a particular user
	 *
	 * @param _userAddress user address to update the wei limit for, required
	 * @param _weiLimitPerEpoch new ETH limit per epoch for user, wei
	 */
	function setWeiLimitPerEpochForUser(address _userAddress, uint192 _weiLimitPerEpoch) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_MANAGER), "access denied");

		// verify user address is set
		require(_userAddress != address(0), "user address not set");

		// update the params
		weiLimitPerEpochOverrides[_userAddress] = _weiLimitPerEpoch;

		// emit an event
		emit WeiLimitUpdated(_userAddress, _weiLimitPerEpoch);
	}

	/**
	 * @notice Restricted access function to withdraw ETH from the faucet
	 *
	 * @param to an address to send ETH to, required
	 * @param value amount of ETH to send, wei, required
	 */
	function withdrawEth(address payable to, uint192 value) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_USER), "access denied");

		// verify the inputs
		require(to != address(0), "recipient not set");
		require(value != 0, "value not set");

		// determine how much ETH user is allowed to withdraw in current epoch
		uint192 allowance = weiLeftInEpochForUser(msg.sender);

		// verify the request doesn't exceed the allowance
		require(value <= allowance, "allowance exceeded");

		// verify the request doesn't exceed faucet balance
		require(value <= address(this).balance, "balance exceeded");

		// get a link to the user withdrawal stat
		WithdrawalStat storage userStat = withdrawalStats[msg.sender];

		// update user withdrawal stat:
		// if user stat doesn't exist or is too old (updated in the previous epoch)
		if(userStat.lastWithdrawalTimestamp / epochLength < block.timestamp / epochLength) {
			// overwrite it
			userStat.weiWithdrawn = value;
		}
		// if user stat is fresh (updated in the current epoch)
		else {
			// merge it
			userStat.weiWithdrawn += value;
		}

		// update the last withdrawal timestamp
		userStat.lastWithdrawalTimestamp = uint64(block.timestamp);

		// send the ETH to the destination requested
		to.transfer(value);

		// emit an event
		emit ETHWithdrawn(to, value);
	}

	/**
	 * @notice Bonus: a restricted access function to mint any ERC20 token
	 *
	 * @dev Proxies the request as `target.mint(to, value)`, and can be used
	 *      to mint any "mintable" entity, that is having the `mint(address,uint256)`
	 *      function available
	 *
	 * @dev Implicitly limits the value to the 192-bits space, effectively protecting
	 *      target token contract from integer overflow
	 *
	 * @dev Requires executor to have `ROLE_FAUCET_USER` permission
	 * @dev Requires Faucet to have the permission to execute `mint` function on the
	 *      target contract (don't forget to setup it)
	 *
	 * @param target target smart contract address to invoke function call on, required
	 * @param to an address to mint tokens to, required
	 * @param value amount of tokens to mint, wei, required
	 */
	function mint(address target, address to, uint192 value) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_USER), "access denied");

		// verify the inputs
		require(target != address(0), "target contract not set");
		require(to != address(0), "recipient not set");
		require(value != 0, "value not set");

		// prepare the mint payload for a low-level function call
		bytes memory payload = abi.encodeWithSignature("mint(address,uint256)", to, value);

		// execute the low-level function call
		(bool success, ) = target.call{gas: 81_000}(payload);

		// verify the result, throw on error
		require(success, "low-level function call failed");

		// emit an event
		emit MintProxied(target, to, value);
	}

	/**
	 * @dev Restricted access function to add faucet users in bulk mode
	 *
	 * @param users user addresses to add
	 */
	function addUsers(address[] calldata users) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_MANAGER), "access denied");

		// verify the input array is set
		require(users.length != 0, "empty users array");

		// process each user address individually
		for(uint256 i = 0; i < users.length; i++) {
			// and share `ROLE_FAUCET_USER` with it
			// calculate the role
			uint256 role = getRole(users[i]) | ROLE_FAUCET_USER;
			// set the calculated role
			// execute via external call in order to use contract's self-permissions
			this.updateRole(users[i], role);
		}
	}

	/**
	 * @dev Restricted access function to remove faucet users in bulk mode
	 *
	 * @param users user addresses to remove
	 */
	function removeUsers(address[] calldata users) public {
		// verify the access permission
		require(isSenderInRole(ROLE_FAUCET_MANAGER), "access denied");

		// verify the input array is set
		require(users.length != 0, "empty users array");

		// process each user address individually
		for(uint256 i = 0; i < users.length; i++) {
			// and remove `ROLE_FAUCET_USER` from it
			// calculate the role
			uint256 role = getRole(users[i]) ^ ROLE_FAUCET_USER;
			// set the calculated role
			// execute via external call in order to use contract's self-permissions
			this.updateRole(users[i], role);
		}
	}

	/**
	 * @dev Allow our dear valued users to send their ETH back
	 */
	receive() external payable {}
}
