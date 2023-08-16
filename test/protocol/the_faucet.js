// The Faucet Tests

// Hardhat Network Helpers
// https://hardhat.org/hardhat-network-helpers/docs/overview
const {
	mine,
} = require("@nomicfoundation/hardhat-network-helpers");

// Zeppelin test helpers
const {
	BN,
	balance,
	constants,
	expectEvent,
	expectRevert,
} = require("@openzeppelin/test-helpers");
const {
	assert,
	expect,
} = require("chai");

const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
} = constants;

// BN constants and utilities
const {
	toBN,
} = require("../../scripts/include/bn_utils");

// ACL features and roles
const {
	ROLE_ACCESS_MANAGER,
	FULL_PRIVILEGES_MASK,
	or,
	not,
	ROLE_FAUCET_USER,
	ROLE_FAUCET_MANAGER,
} = require("../../scripts/include/features_roles");

// deployment routines in use
const {
	faucet_deploy_restricted,
	faucet_deploy,
	mintable_noop_deploy,
} = require("./include/deployment_routines");
const {behavesLikeACL} = require("../util/include/acl.behaviour");

// run The Faucet tests
contract("The Faucet tests", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, a1, a2, a3, a4] = accounts;

	// no deployment tests: no inputs, no tests

	describe("when faucet is deployed without add/remove users functions enabled", function() {
		const user = a1;
		const to = a2;

		let faucet;
		beforeEach(async function() {
			faucet = await faucet_deploy_restricted(a0);
		});
		it("epoch length 'epochLength' is initially 1 day (86400)", async function() {
			expect(await faucet.epochLength()).to.be.bignumber.that.equals("86400");
		});
		it("wei limit per epoch 'weiLimitPerEpoch' is initially 10 ETH (10^19)", async function() {
			expect(await faucet.weiLimitPerEpoch()).to.be.bignumber.that.equals(new BN(10).pow(new BN(19)));
		});
		it("wei limit override for a user 'weiLimitPerEpochOverrides' is not set initially", async function() {
			expect(await faucet.weiLimitPerEpochOverrides(user)).to.be.bignumber.that.equals("0");
		});
		it("wei limit per epoch for a user 'weiLimitPerEpochForUser' is initially 10 ETH (10^19)", async function() {
			expect(await faucet.weiLimitPerEpochForUser(user)).to.be.bignumber.that.equals(new BN(10).pow(new BN(19)));
		});
		it("wei withdrawn in epoch for a user 'weiLimitPerEpochForUser' is initially zero", async function() {
			expect(await faucet.weiWithdrawnInCurrentEpoch(user)).to.be.bignumber.that.equals("0");
		});
		it("wei left in epoch for a user 'weiLeftInEpochForUser' is initially 10 ETH (10^19)", async function() {
			expect(await faucet.weiLeftInEpochForUser(user)).to.be.bignumber.that.equals(new BN(10).pow(new BN(19)));
		});
		it("addUsers revers", async function() {
			await expectRevert(faucet.addUsers([a1, a2], {from: a0}), "access denied");
		});
		it("removeUsers revers", async function() {
			await expectRevert(faucet.removeUsers([a1, a2], {from: a0}), "access denied");
		});
		describe("user withdrawal stats are initially empty", function() {
			let withdrawalStats;
			before(async function() {
				withdrawalStats = await faucet.withdrawalStats(user);
			});
			it("lastWithdrawalTimestamp = 0", async function() {
				expect(withdrawalStats.lastWithdrawalTimestamp).to.be.bignumber.that.equals("0");
			});
			it("weiWithdrawn = 0", async function() {
				expect(withdrawalStats.weiWithdrawn).to.be.bignumber.that.equals("0");
			});
		});
		describe("after add/remove users functions are enabled", function() {
			beforeEach(async function() {
				await faucet.updateFeatures(or(ROLE_ACCESS_MANAGER, ROLE_FAUCET_USER), {from: a0});
			});
			describe("ACL", function() {
				const operator = a1;
				const user = a2;

				const setEpochParams = async () => faucet.setEpochParams(1, 1, {from: operator});
				const setWeiLimitPerEpochForUser = async () => faucet.setWeiLimitPerEpochForUser(user, 1, {from: operator});
				const addUsers = async () => faucet.addUsers([user], {from: operator});
				const removeUsers = async () => faucet.removeUsers([user], {from: operator});
				describe("when executed not by ROLE_FAUCET_MANAGER", function() {
					beforeEach(async function() {
						await faucet.updateRole(operator, not(ROLE_FAUCET_MANAGER), {from: a0});
					});
					it("'setEpochParams' reverts", async function() {
						await expectRevert(setEpochParams(), "access denied");
					});
					it("'setWeiLimitPerEpochForUser' reverts", async function() {
						await expectRevert(setWeiLimitPerEpochForUser(), "access denied");
					});
					it("'addUsers' reverts", async function() {
						await expectRevert(addUsers(), "access denied");
					});
					it("'removeUsers' reverts", async function() {
						await expectRevert(removeUsers(), "access denied");
					});
				});
				describe("when executed by ROLE_FAUCET_MANAGER", function() {
					beforeEach(async function() {
						await faucet.updateRole(operator, ROLE_FAUCET_MANAGER, {from: a0});
					});
					it("'setEpochParams' doesn't revert", async function() {
						await setEpochParams();
					});
					it("'setWeiLimitPerEpochForUser' doesn't revert", async function() {
						await setWeiLimitPerEpochForUser();
					});
					it("'addUsers' doesn't revert", async function() {
						await addUsers();
					});
					it("'removeUsers' doesn't revert", async function() {
						await removeUsers();
					});
				});

				describe("when there is one wei on the faucet balance", function() {
					beforeEach(async function() {
						await web3.eth.sendTransaction({from: a0, to: faucet.address, value: 1});
					});

					const withdrawEth = async () => faucet.withdrawEth(user, 1, {from: operator});
					describe("when executed not by ROLE_FAUCET_USER", function() {
						beforeEach(async function() {
							await faucet.updateRole(operator, not(ROLE_FAUCET_USER), {from: a0});
						});
						it("'withdrawEth' reverts", async function() {
							await expectRevert(withdrawEth(), "access denied");
						});
					});
					describe("when executed by ROLE_FAUCET_USER", function() {
						beforeEach(async function() {
							await faucet.updateRole(operator, ROLE_FAUCET_USER, {from: a0});
						});
						it("'withdrawEth' doesn't revert", async function() {
							await withdrawEth();
						});
					});
				});
				describe("when there is an ERC20 contract deployed which faucet can mint", function() {
					let mintable_addr;
					beforeEach(async function() {
						({address: mintable_addr} = await mintable_noop_deploy(a0));
					});

					const mint = async () => faucet.mint(mintable_addr, user, 1, {from: operator});
					describe("when executed not by ROLE_FAUCET_USER", function() {
						beforeEach(async function() {
							await faucet.updateRole(operator, not(ROLE_FAUCET_USER), {from: a0});
						});
						it("'mint' reverts", async function() {
							await expectRevert(mint(), "access denied");
						});
					});
					describe("when executed by ROLE_FAUCET_USER", function() {
						beforeEach(async function() {
							await faucet.updateRole(operator, ROLE_FAUCET_USER, {from: a0});
						});
						it("'mint' doesn't revert", async function() {
							await mint();
						});
					});
				});
			});
			describe("faucet manager ROLE_FAUCET_MANAGER flows", function() {
				describe("updating the epoch params, 'setEpochParams'", function() {
					it("fails if epoch length '_epochLength' is not set (zero)", async function() {
						await expectRevert(faucet.setEpochParams(0, 1, {from: a0}), "epoch length not set");
					});
					describe("succeeds otherwise", function() {
						let receipt;
						beforeEach(async function() {
							receipt = await faucet.setEpochParams(1, 1, {from: a0});
						});
						it("'EpochParamsUpdated' event is emitted", async function() {
							expectEvent(receipt, "EpochParamsUpdated", {
								epochLength: "1",
								weiLimitPerEpoch: "1",
							});
						});
						it("epoch length 'epochLength' is updated correctly", async function() {
							expect(await faucet.epochLength()).to.be.bignumber.that.equals("1");
						});
						it("wei limit per epoch 'weiLimitPerEpoch' is updated correctly", async function() {
							expect(await faucet.weiLimitPerEpoch()).to.be.bignumber.that.equals("1");
						});
					});
				});
				describe("updating the wei limit for a particular user, 'setWeiLimitPerEpochForUser'", function() {
					it("fails if user address '_userAddress' is not set (zero)", async function() {
						await expectRevert(faucet.setWeiLimitPerEpochForUser(ZERO_ADDRESS, 1, {from: a0}), "user address not set");
					});
					describe("succeeds otherwise", function() {
						let receipt;
						beforeEach(async function() {
							receipt = await faucet.setWeiLimitPerEpochForUser(a1, 1, {from: a0});
						});
						it("'WeiLimitUpdated' event is emitted", async function() {
							expectEvent(receipt, "WeiLimitUpdated", {
								userAddress: a1,
								weiLimitPerEpoch: "1",
							});
						});
						it("wei limit override for a user 'weiLimitPerEpochOverrides' is updated correctly", async function() {
							expect(await faucet.weiLimitPerEpochOverrides(a1)).to.be.bignumber.that.equals("1");
						});
						it("wei limit per epoch for a user 'weiLimitPerEpochForUser' is updated correctly", async function() {
							expect(await faucet.weiLimitPerEpochForUser(a1)).to.be.bignumber.that.equals("1");
						});
					});
				});
				describe("adding faucet users, 'addUsers'", function() {
					it("fails if users array 'users' is empty", async function() {
						await expectRevert(faucet.addUsers([], {from: a0}), "empty users array");
					});
					describe("succeeds otherwise", function() {
						let receipt;
						beforeEach(async function() {
							receipt = await faucet.addUsers([a1], {from: a0});
						});
						it("'RoleUpdated' event is emitted", async function() {
							expectEvent(receipt, "RoleUpdated", {
								_by: faucet.address,
								_to: a1,
								_requested: ROLE_FAUCET_USER + "",
								_assigned: ROLE_FAUCET_USER + "",
							});
						});
						it("the addresses added become faucet users ROLE_FAUCET_USER", async function() {
							expect(await faucet.isOperatorInRole(a1, ROLE_FAUCET_USER)).to.be.true;
						});
						it("the addresses added doesn't obtain any other roles", async function() {
							expect(await faucet.getRole(a1)).to.be.bignumber.that.equals(ROLE_FAUCET_USER + "");
						});
					});
				});
				describe("removing faucet users, 'removeUsers'", function() {
					it("fails if users array 'users' is empty", async function() {
						await expectRevert(faucet.removeUsers([], {from: a0}), "empty users array");
					});
					describe("succeeds otherwise", function() {
						let receipt;
						beforeEach(async function() {
							faucet.addUsers([a1], {from: a0});
							receipt = await faucet.removeUsers([a1], {from: a0});
						});
						it("'RoleUpdated' event is emitted", async function() {
							expectEvent(receipt, "RoleUpdated", {
								_by: faucet.address,
								_to: a1,
								_requested: "0",
								_assigned: "0",
							});
						});
						it("the addresses removed stop being faucet users ROLE_FAUCET_USER", async function() {
							expect(await faucet.isOperatorInRole(a1, ROLE_FAUCET_USER)).to.be.false;
						});
						it("the addresses removed doesn't obtain any other roles", async function() {
							expect(await faucet.getRole(a1)).to.be.bignumber.that.equals("0");
						});
					});
				});
			});
			describe("faucet user ROLE_FAUCET_USER flows", function() {
				describe("minting (proxying the mint request)", function() {
					let mintable;
					beforeEach(async function() {
						mintable = await mintable_noop_deploy(a0);
					});

					it("fails if target contract is not set", async function() {
						await expectRevert(faucet.mint(ZERO_ADDRESS, a1, 1, {from: a0}), "target contract not set");
					});
					it("fails if the recipient is not set", async function() {
						await expectRevert(faucet.mint(mintable.address, ZERO_ADDRESS, 1, {from: a0}), "recipient not set");
					});
					it("fails if value is not set", async function() {
						await expectRevert(faucet.mint(mintable.address, a1, 0, {from: a0}), "value not set");
					});
					it("fails if value is too big (outside the 192 bits space)", async function() {
						await expectRevert(faucet.mint(mintable.address, a1, new BN(2).pow(new BN(192)), {from: a0}), "value out-of-bounds");
					});
					describe("succeeds otherwise", function() {
						let receipt;
						beforeEach(async function() {
							receipt = await faucet.mint(mintable.address, a1, 1, {from: a0});
						});
						it("'MintProxied' event is emitted", async function() {
							expectEvent(receipt, "MintProxied", {
								target: mintable.address,
								to: a1,
								value: "1",
							});
						});
						it("'MintLogged' event is emitted", async function() {
							await expectEvent.inTransaction(receipt.tx, mintable, "MintLogged", {
								to: a1,
								value: "1",
							});
						});
					});
				});
				describe("getting ETH", function() {
					beforeEach(async function() {
						await faucet.updateRole(user, ROLE_FAUCET_USER, {from: a0});
					});
					it("fails if the faucet is empty", async function() {
						await expectRevert(faucet.withdrawEth(to, 1, {from: user}), "balance exceeded");
					});
					describe("when faucet has some ETH supplied", function() {
						beforeEach(async function() {
							await web3.eth.sendTransaction({from: a0, to: faucet.address, value: web3.utils.toWei("20", "ether")});
						});
						it("fails if the recipient is not set zero)", async function() {
							await expectRevert(faucet.withdrawEth(ZERO_ADDRESS, 1, {from: user}), "recipient not set");
						});
						it("fails if the value is not set (zero)", async function() {
							await expectRevert(faucet.withdrawEth(to, 0, {from: user}), "value not set");
						});
						it("fails if the user requests too much (more than 10 ETH)", async function() {
							await expectRevert(faucet.withdrawEth(to, new BN(10).pow(new BN(19)).addn(1), {from: user}), "allowance exceeded");
						});
						describe("succeeds otherwise", function() {
							let tracker;
							let receipt;
							beforeEach(async function() {
								tracker = await balance.tracker(to);
								receipt = await faucet.withdrawEth(to, 1, {from: user});
							});
							it("'ETHWithdrawn' event is emitted", async function() {
								expectEvent(receipt, "ETHWithdrawn", {
									to: to,
									value: "1",
								});
							});
							describe("user withdrawal stats are created", function() {
								let withdrawalStats;
								beforeEach(async function() {
									withdrawalStats = await faucet.withdrawalStats(user);
								});
								it("lastWithdrawalTimestamp = block.timestamp", async function() {
									const block = await web3.eth.getBlock(receipt.receipt.blockNumber);
									expect(withdrawalStats.lastWithdrawalTimestamp).to.be.bignumber.that.equals(block.timestamp + "");
								});
								it("weiWithdrawn = 1", async function() {
									expect(withdrawalStats.weiWithdrawn).to.be.bignumber.that.equals("1");
								});
							});
							it("1 wei is transferred from the faucet to the recipient", async function() {
								expect(await tracker.delta()).to.be.bignumber.that.equals("1");
							});
							it("wei left in epoch for a user 'weiLeftInEpochForUser' reduces to 9.99(9) ETH", async function() {
								expect(await faucet.weiLeftInEpochForUser(user)).to.be.bignumber.that.equals(new BN(10).pow(new BN(19)).subn(1));
							});
							describe("withdrawing ETH again", function() {
								it("fails if the user requests too much (10 ETH)", async function() {
									await expectRevert(faucet.withdrawEth(to, new BN(10).pow(new BN(19)), {from: user}), "allowance exceeded");
								});
								describe("succeeds otherwise", function() {
									let receipt;
									beforeEach(async function() {
										receipt = await faucet.withdrawEth(to, 1, {from: user});
									});
									describe("user withdrawal stats are merged", function() {
										let withdrawalStats;
										beforeEach(async function() {
											withdrawalStats = await faucet.withdrawalStats(user);
										});
										it("lastWithdrawalTimestamp = block.timestamp", async function() {
											const block = await web3.eth.getBlock(receipt.receipt.blockNumber);
											expect(withdrawalStats.lastWithdrawalTimestamp).to.be.bignumber.that.equals(block.timestamp + "");
										});
										it("weiWithdrawn = 2", async function() {
											expect(withdrawalStats.weiWithdrawn).to.be.bignumber.that.equals("2");
										});
									});
								});
							});
						});
					});
				});
				describe("switching to a new epoch", function() {
					beforeEach(async function() {
						// set the epoch length to the minimum possible value, so that new epoch begins every block
						await faucet.setEpochParams(1, 1, {from: a0});
						await web3.eth.sendTransaction({from: a0, to: faucet.address, value: 20});
						await faucet.updateRole(user, ROLE_FAUCET_USER, {from: a0});
					});
					describe("after the successful ETH withdrawal and epoch switch", function() {
						beforeEach(async function() {
							// get 1 wei
							await faucet.withdrawEth(to, 1, {from: user});
							// move to the next block and epoch
							await mine(1);
						});
						it("wei left in epoch for a user 'weiLeftInEpochForUser' resets to 1 wei", async function() {
							expect(await faucet.weiLeftInEpochForUser(user)).to.be.bignumber.that.equals("1");
						});
						it("it is possible to withdraw ETH again", async function() {
							await faucet.withdrawEth(to, 1, {from: user});
						});
					});
				});
			});
			describe("admin self-removal as a user: after admin self-removes", function() {
				let receipt;
				beforeEach(async function() {
					receipt = await faucet.removeUsers([a0], {from: a0});
				});
				it("admins user role gets removed", async function() {
					expect(await faucet.isSenderInRole(ROLE_FAUCET_USER, {from: a0})).to.be.false;
				});
				it("admin manager role gets preserved", async function() {
					expect(await faucet.isSenderInRole(ROLE_ACCESS_MANAGER, {from: a0})).to.be.true;
				});
				it("admin other roles gets preserved", async function() {
					expect(await faucet.isSenderInRole(not(ROLE_FAUCET_USER), {from: a0})).to.be.true;
				});
				describe("admin self-recovers as a user: after admin self-removes", function() {
					let receipt;
					beforeEach(async function() {
						receipt = await faucet.addUsers([a0], {from: a0});
					});
					it("admin role gets full bitmask", async function() {
						expect(await faucet.isSenderInRole(FULL_PRIVILEGES_MASK, {from: a0})).to.be.true;
					});
				});
			});
		});
	});
});
