const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AdminMultiSig", function () {
  async function deployFixture() {
    const [ownerA, ownerB, ownerC, outsider, coordinatorCandidate] = await ethers.getSigners();
    const owners = [ownerA.address, ownerB.address, ownerC.address];

    const AdminMultiSig = await ethers.getContractFactory("AdminMultiSig");
    const multisig = await AdminMultiSig.deploy(owners, 2); // 2-of-3
    await multisig.waitForDeployment();

    const GatePass = await ethers.getContractFactory("GatePass");
    const gatePass = await GatePass.deploy(await multisig.getAddress());
    await gatePass.waitForDeployment();

    return { multisig, gatePass, ownerA, ownerB, ownerC, outsider, coordinatorCandidate };
  }

  it("rejects a bad constructor (no owners, zero/duplicate owner, bad threshold)", async function () {
    const [a] = await ethers.getSigners();
    const AdminMultiSig = await ethers.getContractFactory("AdminMultiSig");

    await expect(AdminMultiSig.deploy([], 1)).to.be.revertedWith("AdminMultiSig: owners required");
    await expect(AdminMultiSig.deploy([a.address], 0)).to.be.revertedWith("AdminMultiSig: invalid threshold");
    await expect(AdminMultiSig.deploy([a.address], 2)).to.be.revertedWith("AdminMultiSig: invalid threshold");
    await expect(AdminMultiSig.deploy([a.address, a.address], 2)).to.be.revertedWith(
      "AdminMultiSig: duplicate owner"
    );
  });

  it("executes a proposal only once the required number of distinct owners confirm", async function () {
    const { multisig, ownerA, ownerB } = await deployFixture();

    // Propose a no-op-ish call to itself (ownerCount) just to exercise propose/confirm/execute.
    const data = multisig.interface.encodeFunctionData("ownerCount");
    const tx = await multisig.connect(ownerA).propose(await multisig.getAddress(), data);
    const receipt = await tx.wait();
    const created = receipt.logs
      .map((log) => {
        try {
          return multisig.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "ProposalCreated");
    const proposalId = created.args.id;

    let proposal = await multisig.getProposal(proposalId);
    expect(proposal.confirmations).to.equal(1); // proposer auto-confirms
    expect(proposal.executed).to.equal(false);

    await expect(multisig.connect(ownerB).confirm(proposalId))
      .to.emit(multisig, "ProposalExecuted")
      .withArgs(proposalId);

    proposal = await multisig.getProposal(proposalId);
    expect(proposal.executed).to.equal(true);
  });

  it("rejects propose/confirm from non-owners", async function () {
    const { multisig, outsider } = await deployFixture();
    const data = multisig.interface.encodeFunctionData("ownerCount");

    await expect(multisig.connect(outsider).propose(await multisig.getAddress(), data)).to.be.revertedWith(
      "AdminMultiSig: not an owner"
    );
  });

  it("rejects the same owner confirming twice", async function () {
    const { multisig, ownerA } = await deployFixture();
    const data = multisig.interface.encodeFunctionData("ownerCount");
    await multisig.connect(ownerA).propose(await multisig.getAddress(), data);

    await expect(multisig.connect(ownerA).confirm(0)).to.be.revertedWith("AdminMultiSig: already confirmed");
  });

  it("rejects confirming an already-executed or unknown proposal", async function () {
    const { multisig, ownerA, ownerB } = await deployFixture();
    const data = multisig.interface.encodeFunctionData("ownerCount");
    await multisig.connect(ownerA).propose(await multisig.getAddress(), data);
    await multisig.connect(ownerB).confirm(0); // executes at 2-of-3

    await expect(multisig.connect(ownerA).confirm(0)).to.be.revertedWith("AdminMultiSig: already executed");
    await expect(multisig.connect(ownerB).confirm(99)).to.be.revertedWith("AdminMultiSig: unknown proposal");
  });

  it("end-to-end: governs GatePass role grants, no single owner can grant a role alone", async function () {
    const { multisig, gatePass, ownerA, ownerB, coordinatorCandidate } = await deployFixture();

    const COORDINATOR_ROLE = await gatePass.COORDINATOR_ROLE();
    const grantData = gatePass.interface.encodeFunctionData("grantRole", [
      COORDINATOR_ROLE,
      coordinatorCandidate.address,
    ]);

    await multisig.connect(ownerA).propose(await gatePass.getAddress(), grantData);

    // Only one confirmation so far -> role must NOT be granted yet.
    expect(await gatePass.hasRole(COORDINATOR_ROLE, coordinatorCandidate.address)).to.equal(false);

    await multisig.connect(ownerB).confirm(0);

    expect(await gatePass.hasRole(COORDINATOR_ROLE, coordinatorCandidate.address)).to.equal(true);
  });
});
