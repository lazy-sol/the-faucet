// copy and export all the features and roles constants from different contracts

// Auxiliary BN stuff
const BN = web3.utils.BN;
const TWO = new BN(2);

// Access manager is responsible for assigning the roles to users,
// enabling/disabling global features of the smart contract
const ROLE_ACCESS_MANAGER = TWO.pow(new BN(255));

// Upgrade manager is responsible for smart contract upgrades
const ROLE_UPGRADE_MANAGER = TWO.pow(new BN(254));

// Bitmask representing all the possible permissions (super admin role)
const FULL_PRIVILEGES_MASK = TWO.pow(new BN(256)).subn(1);

// All 16 features enabled
const FEATURE_ALL = 0x0000_FFFF;

// combine the role (permission set) provided
function or(...roles) {
	let roles_sum = new BN(0);
	for(let role of roles) {
		roles_sum = roles_sum.or(new BN(role));
	}
	return roles_sum;
}

// negates the role (permission set) provided
function not(...roles) {
	return FULL_PRIVILEGES_MASK.xor(or(...roles));
}

// Start: ===== ERC20/ERC721 =====

// [ERC20/ERC721] Token creator is responsible for creating (minting) tokens to an arbitrary address
const ROLE_TOKEN_CREATOR = 0x0001_0000;

// End: ===== ERC20/ERC721 =====

// Start: ===== TheFaucet =====

// Faucet user is allowed to get ETH via The Faucet
const ROLE_FAUCET_USER = 0x0001_0000;

// Faucet manager is responsible for faucet configuration and managing faucet users
const ROLE_FAUCET_MANAGER = 0x0002_0000;

// End: ===== TheFaucet =====


// export public module API
module.exports = {
	ROLE_ACCESS_MANAGER,
	ROLE_UPGRADE_MANAGER,
	FULL_PRIVILEGES_MASK,
	FEATURE_ALL,
	or,
	not,
	ROLE_TOKEN_CREATOR,
	ROLE_FAUCET_MANAGER,
	ROLE_FAUCET_USER,
};
