// ACL features and roles
const {
	ROLE_ACCESS_MANAGER,
	or,
	ROLE_FAUCET_USER,
} = require("../../../scripts/include/features_roles");

/**
 * Deploys The Faucet via ERC1967Proxy with the add/remove users functions enabled
 *
 * @param a0 smart contract deployer, owner, super admin
 * @returns ERC1967Proxy –> TheFaucet instance
 */
async function faucet_deploy(a0) {
	// deploy the restricted
	const faucet = await faucet_deploy_restricted(a0);

	// enable add/remove users functions
	await faucet.updateFeatures(or(ROLE_ACCESS_MANAGER, ROLE_FAUCET_USER), {from: a0});

	// return the instance
	return faucet;
}

/**
 * Deploys The Faucet via ERC1967Proxy with no add/remove users functions enabled
 *
 * @param a0 smart contract deployer, owner, super admin
 * @returns ERC1967Proxy –> TheFaucet instance
 */
async function faucet_deploy_restricted(a0) {
	// smart contracts required
	const TheFaucetV1 = artifacts.require("./TheFaucetV1");
	const ERC1967Proxy = artifacts.require("./ERC1967Proxy");

	// deploy the upgradeable ACL
	const instance = await TheFaucetV1.new({from: a0});

	// prepare the initialization call bytes
	const init_data = instance.contract.methods.postConstruct().encodeABI();

	// deploy proxy, and initialize the impl (inline)
	const proxy = await ERC1967Proxy.new(instance.address, init_data, {from: a0});

	// wrap the proxy into the impl ABI and return proxy instance
	return await TheFaucetV1.at(proxy.address);
}

/**
 * Deploys Mintable No-op Mock
 * @param a0 smart contract deployer
 * @return MintableNoopMock
 */
async function mintable_noop_deploy(a0) {
	// smart contracts required
	const MintableNoopMock = artifacts.require("./MintableNoopMock");

	// deploy and return
	return await MintableNoopMock.new({from: a0});
}

// export public deployment API
module.exports = {
	faucet_deploy_restricted,
	faucet_deploy,
	mintable_noop_deploy,
}
