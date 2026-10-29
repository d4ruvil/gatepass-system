const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;

const PassStatus = {
  Pending: 0,
  CoordinatorApproved: 1,
  LabApproved: 2,
  Approved: 3,
  Rejected: 4,
  Revoked: 5,
};

const EffectiveStatus = {
  ...PassStatus,
  Expired: 6,
};

function hashOf(str) {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

describe("GatePass", function () {
  async function deployFixture() {
    const [admin, backend, coordinator, labIncharge, dean, outsider, otherDean] = await ethers.getSigners();

    const GatePass = await ethers.getContractFactory("GatePass");
    const gatePass = await GatePass.deploy(admin.address);
    await gatePass.waitForDeployment();

    await gatePass.connect(admin).grantRole(await gatePass.BACKEND_ROLE(), backend.address);
    await gatePass.connect(admin).grantRole(await gatePass.COORDINATOR_ROLE(), coordinator.address);
    await gatePass.connect(admin).grantRole(await gatePass.LAB_INCHARGE_ROLE(), labIncharge.address);
    await gatePass.connect(admin).grantRole(await gatePass.DEAN_ROLE(), dean.address);
    // extra dean for the "wrong wallet with right role" style checks
    await gatePass.connect(admin).grantRole(await gatePass.DEAN_ROLE(), otherDean.address);

    return { gatePass, admin, backend, coordinator, labIncharge, dean, outsider, otherDean };
  }

  async function submitDefaultPass(gatePass, backend, overrides = {}) {
    const now = await time.latest();
    const validFrom = overrides.validFrom ?? now + 60;
    const validTo = overrides.validTo ?? validFrom + 2 * DAY;
    const timeFrom = overrides.timeFrom ?? 9 * 60; // 9:00 AM
    const timeTo = overrides.timeTo ?? 21 * 60; // 9:00 PM
    const dataHash = overrides.dataHash ?? hashOf("student-1|enroll-1|" + validFrom + "|" + validTo);

    const tx = await gatePass.connect(backend).submitPass(dataHash, validFrom, validTo, timeFrom, timeTo);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return gatePass.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "PassSubmitted");
    return { passId: event.args.passId, validFrom, validTo, timeFrom, timeTo, dataHash };
  }

  describe("Happy path", function () {
    it("submit -> coordinator -> lab incharge -> dean results in Approved", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      await expect(gatePass.connect(coordinator).approveAsCoordinator(passId))
        .to.emit(gatePass, "PassApprovedByCoordinator")
        .withArgs(passId, coordinator.address, anyUint());

      await expect(gatePass.connect(labIncharge).approveAsLabIncharge(passId))
        .to.emit(gatePass, "PassApprovedByLabIncharge")
        .withArgs(passId, labIncharge.address, anyUint());

      await expect(gatePass.connect(dean).approveAsDean(passId))
        .to.emit(gatePass, "PassApprovedByDean")
        .withArgs(passId, dean.address, anyUint());

      const [effectiveStatus, pass] = await gatePass.verifyPass(passId);
      expect(effectiveStatus).to.equal(EffectiveStatus.Approved);
      expect(pass.status).to.equal(PassStatus.Approved);
      expect(pass.coordinator).to.equal(coordinator.address);
      expect(pass.labIncharge).to.equal(labIncharge.address);
      expect(pass.dean).to.equal(dean.address);
    });
  });

  describe("Validation rules enforced on-chain", function () {
    it("rejects a request exceeding the 15 day maximum validity", async function () {
      const { gatePass, backend } = await deployFixture();
      const now = await time.latest();
      const validFrom = now + 60;
      const validTo = validFrom + 16 * DAY;

      await expect(
        gatePass.connect(backend).submitPass(hashOf("x"), validFrom, validTo, 9 * 60, 21 * 60)
      ).to.be.revertedWith("GatePass: exceeds 15 day maximum");
    });

    it("accepts a request at exactly the 15 day maximum", async function () {
      const { gatePass, backend } = await deployFixture();
      const now = await time.latest();
      const validFrom = now + 60;
      const validTo = validFrom + 15 * DAY;

      await expect(gatePass.connect(backend).submitPass(hashOf("x"), validFrom, validTo, 9 * 60, 21 * 60)).to.not.be
        .reverted;
    });

    it("rejects a validFrom in the past", async function () {
      const { gatePass, backend } = await deployFixture();
      const now = await time.latest();

      await expect(
        gatePass.connect(backend).submitPass(hashOf("x"), now - DAY, now + DAY, 9 * 60, 21 * 60)
      ).to.be.revertedWith("GatePass: validFrom in the past");
    });

    it("rejects timeFrom that is not before timeTo", async function () {
      const { gatePass, backend } = await deployFixture();
      const now = await time.latest();

      await expect(
        gatePass.connect(backend).submitPass(hashOf("x"), now + 60, now + DAY, 21 * 60, 9 * 60)
      ).to.be.revertedWith("GatePass: timeFrom must be before timeTo");
    });

    it("only BACKEND_ROLE can submit a pass", async function () {
      const { gatePass, outsider } = await deployFixture();
      const now = await time.latest();

      await expect(
        gatePass.connect(outsider).submitPass(hashOf("x"), now + 60, now + DAY, 9 * 60, 21 * 60)
      ).to.be.revertedWithCustomError(gatePass, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Approval order enforcement", function () {
    it("rejects lab incharge approving before coordinator", async function () {
      const { gatePass, backend, labIncharge } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      await expect(gatePass.connect(labIncharge).approveAsLabIncharge(passId)).to.be.revertedWith(
        "GatePass: not awaiting lab incharge approval"
      );
    });

    it("rejects dean approving before lab incharge", async function () {
      const { gatePass, backend, coordinator, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);

      await expect(gatePass.connect(dean).approveAsDean(passId)).to.be.revertedWith(
        "GatePass: not awaiting dean approval"
      );
    });

    it("rejects an approval from a wallet without the right role", async function () {
      const { gatePass, backend, outsider } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      await expect(gatePass.connect(outsider).approveAsCoordinator(passId)).to.be.revertedWithCustomError(
        gatePass,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("rejects double approval by the same role", async function () {
      const { gatePass, backend, coordinator } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);

      await expect(gatePass.connect(coordinator).approveAsCoordinator(passId)).to.be.revertedWith(
        "GatePass: not awaiting coordinator approval"
      );
    });
  });

  describe("Expiry", function () {
    it("reports Expired via verifyPass once validTo has passed, without mutating stored status", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean } = await deployFixture();
      const now = await time.latest();
      const validFrom = now + 60;
      const validTo = validFrom + DAY;
      const { passId } = await submitDefaultPass(gatePass, backend, { validFrom, validTo });

      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);
      await gatePass.connect(dean).approveAsDean(passId);

      await time.increaseTo(validTo + 1);

      const [effectiveStatus, pass] = await gatePass.verifyPass(passId);
      expect(effectiveStatus).to.equal(EffectiveStatus.Expired);
      expect(pass.status).to.equal(PassStatus.Approved); // stored status is untouched
    });
  });

  describe("Revocation", function () {
    it("dean can revoke an approved pass and it cannot be un-revoked", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);
      await gatePass.connect(dean).approveAsDean(passId);

      await expect(gatePass.connect(dean).revokePass(passId))
        .to.emit(gatePass, "PassRevoked")
        .withArgs(passId, dean.address, anyUint());

      const [effectiveStatus, pass] = await gatePass.verifyPass(passId);
      expect(effectiveStatus).to.equal(EffectiveStatus.Revoked);
      expect(pass.status).to.equal(PassStatus.Revoked);

      // cannot un-revoke / re-revoke
      await expect(gatePass.connect(dean).revokePass(passId)).to.be.revertedWith(
        "GatePass: only approved passes can be revoked"
      );
    });

    it("admin can also revoke an approved pass", async function () {
      const { gatePass, admin, backend, coordinator, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);
      await gatePass.connect(dean).approveAsDean(passId);

      await expect(gatePass.connect(admin).revokePass(passId)).to.emit(gatePass, "PassRevoked");
    });

    it("rejects revocation attempts from non-dean/non-admin wallets", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean, outsider } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);
      await gatePass.connect(dean).approveAsDean(passId);

      await expect(gatePass.connect(outsider).revokePass(passId)).to.be.revertedWith(
        "GatePass: not authorized to revoke"
      );
    });

    it("cannot revoke a pass that is not yet Approved", async function () {
      const { gatePass, backend, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      await expect(gatePass.connect(dean).revokePass(passId)).to.be.revertedWith(
        "GatePass: only approved passes can be revoked"
      );
    });
  });

  describe("Rejection", function () {
    it("coordinator can reject a pending pass with a reason, and it cannot later be approved", async function () {
      const { gatePass, backend, coordinator, labIncharge } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      await expect(gatePass.connect(coordinator).rejectPass(passId, "Missing declaration"))
        .to.emit(gatePass, "PassRejected")
        .withArgs(passId, coordinator.address, "Missing declaration", anyUint());

      const [effectiveStatus] = await gatePass.verifyPass(passId);
      expect(effectiveStatus).to.equal(EffectiveStatus.Rejected);

      await expect(gatePass.connect(coordinator).approveAsCoordinator(passId)).to.be.revertedWith(
        "GatePass: not awaiting coordinator approval"
      );
      await expect(gatePass.connect(labIncharge).approveAsLabIncharge(passId)).to.be.revertedWith(
        "GatePass: not awaiting lab incharge approval"
      );
    });

    it("lab incharge can reject a coordinator-approved pass", async function () {
      const { gatePass, backend, coordinator, labIncharge } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);

      await expect(gatePass.connect(labIncharge).rejectPass(passId, "Invalid dates")).to.emit(
        gatePass,
        "PassRejected"
      );
    });

    it("dean can reject a lab-approved pass", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);

      await expect(gatePass.connect(dean).rejectPass(passId, "Not approved")).to.emit(gatePass, "PassRejected");
    });

    it("rejects a reject() call from a wallet whose role doesn't match the current stage", async function () {
      const { gatePass, backend, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);

      // pass is Pending -> only coordinator may reject
      await expect(gatePass.connect(labIncharge).rejectPass(passId, "nope")).to.be.revertedWith(
        "GatePass: not coordinator"
      );
      await expect(gatePass.connect(dean).rejectPass(passId, "nope")).to.be.revertedWith("GatePass: not coordinator");
    });

    it("cannot reject a pass that is already Approved", async function () {
      const { gatePass, backend, coordinator, labIncharge, dean } = await deployFixture();
      const { passId } = await submitDefaultPass(gatePass, backend);
      await gatePass.connect(coordinator).approveAsCoordinator(passId);
      await gatePass.connect(labIncharge).approveAsLabIncharge(passId);
      await gatePass.connect(dean).approveAsDean(passId);

      await expect(gatePass.connect(dean).rejectPass(passId, "too late")).to.be.revertedWith(
        "GatePass: pass is not pending any approval"
      );
    });
  });

  describe("Non-existent passes", function () {
    it("reverts when querying or acting on a pass id that was never submitted", async function () {
      const { gatePass, coordinator } = await deployFixture();

      await expect(gatePass.verifyPass(999)).to.be.revertedWith("GatePass: pass does not exist");
      await expect(gatePass.connect(coordinator).approveAsCoordinator(999)).to.be.revertedWith(
        "GatePass: pass does not exist"
      );
    });
  });
});

// Chai's `withArgs` needs a matcher for timestamps we don't want to hardcode.
function anyUint() {
  return (value) => typeof value === "bigint" && value >= 0n;
}
