// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GatePass
/// @notice Tamper-proof, sequentially-approved student gate pass registry.
/// @dev No personally identifiable information is stored on-chain. Only a
///      hash of the off-chain record, validity window, and approval metadata
///      live here. The off-chain backend (MongoDB) is the source of truth
///      for student identity; this contract is the source of truth for
///      approval status and validity.
contract GatePass is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant COORDINATOR_ROLE = keccak256("COORDINATOR_ROLE");
    bytes32 public constant LAB_INCHARGE_ROLE = keccak256("LAB_INCHARGE_ROLE");
    bytes32 public constant DEAN_ROLE = keccak256("DEAN_ROLE");
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");

    uint64 public constant MAX_VALIDITY_SECONDS = 15 days;

    enum PassStatus {
        Pending,
        CoordinatorApproved,
        LabApproved,
        Approved,
        Rejected,
        Revoked
    }

    /// @dev Superset of PassStatus with a computed-only `Expired` state.
    ///      Expired is never written to storage; it is derived at read time
    ///      in `verifyPass` so we don't need a keeper/cron job to flip state.
    enum EffectiveStatus {
        Pending,
        CoordinatorApproved,
        LabApproved,
        Approved,
        Rejected,
        Revoked,
        Expired
    }

    struct Pass {
        uint256 id;
        bytes32 dataHash; // keccak256/sha256 hash of off-chain student data + dates
        uint64 validFrom; // unix timestamp
        uint64 validTo; // unix timestamp
        uint16 timeFromMinutes; // minutes since midnight
        uint16 timeToMinutes;
        address coordinator;
        address labIncharge;
        address dean;
        uint64 coordinatorApprovedAt;
        uint64 labInchargeApprovedAt;
        uint64 deanApprovedAt;
        address revokedBy;
        uint64 revokedAt;
        PassStatus status;
    }

    uint256 private _nextPassId = 1;
    mapping(uint256 => Pass) private _passes;

    event PassSubmitted(
        uint256 indexed passId,
        bytes32 dataHash,
        uint64 validFrom,
        uint64 validTo,
        uint16 timeFromMinutes,
        uint16 timeToMinutes
    );
    event PassApprovedByCoordinator(uint256 indexed passId, address indexed coordinator, uint64 timestamp);
    event PassApprovedByLabIncharge(uint256 indexed passId, address indexed labIncharge, uint64 timestamp);
    event PassApprovedByDean(uint256 indexed passId, address indexed dean, uint64 timestamp);
    event PassRejected(uint256 indexed passId, address indexed rejectedBy, string reason, uint64 timestamp);
    event PassRevoked(uint256 indexed passId, address indexed revokedBy, uint64 timestamp);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        // ADMIN_ROLE can manage (grant/revoke) all operational roles.
        _setRoleAdmin(COORDINATOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(LAB_INCHARGE_ROLE, ADMIN_ROLE);
        _setRoleAdmin(DEAN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(BACKEND_ROLE, ADMIN_ROLE);
    }

    modifier passExists(uint256 passId) {
        require(passId > 0 && passId < _nextPassId, "GatePass: pass does not exist");
        _;
    }

    /// @notice Backend relayer submits a pass request on behalf of a student.
    /// @dev Students never sign a transaction themselves (see ARCHITECTURE.md
    ///      for the relayer/meta-transaction rationale).
    function submitPass(
        bytes32 dataHash,
        uint64 validFrom,
        uint64 validTo,
        uint16 timeFromMinutes,
        uint16 timeToMinutes
    ) external onlyRole(BACKEND_ROLE) returns (uint256 passId) {
        require(dataHash != bytes32(0), "GatePass: dataHash required");
        require(validFrom >= block.timestamp, "GatePass: validFrom in the past");
        require(validTo > validFrom, "GatePass: validTo must be after validFrom");
        require(validTo - validFrom <= MAX_VALIDITY_SECONDS, "GatePass: exceeds 15 day maximum");
        require(timeFromMinutes < timeToMinutes, "GatePass: timeFrom must be before timeTo");
        require(timeToMinutes < 1440, "GatePass: timeTo out of range");

        passId = _nextPassId++;

        _passes[passId] = Pass({
            id: passId,
            dataHash: dataHash,
            validFrom: validFrom,
            validTo: validTo,
            timeFromMinutes: timeFromMinutes,
            timeToMinutes: timeToMinutes,
            coordinator: address(0),
            labIncharge: address(0),
            dean: address(0),
            coordinatorApprovedAt: 0,
            labInchargeApprovedAt: 0,
            deanApprovedAt: 0,
            revokedBy: address(0),
            revokedAt: 0,
            status: PassStatus.Pending
        });

        emit PassSubmitted(passId, dataHash, validFrom, validTo, timeFromMinutes, timeToMinutes);
    }

    function approveAsCoordinator(uint256 passId) external onlyRole(COORDINATOR_ROLE) passExists(passId) {
        Pass storage pass = _passes[passId];
        require(pass.status == PassStatus.Pending, "GatePass: not awaiting coordinator approval");

        pass.coordinator = msg.sender;
        pass.coordinatorApprovedAt = uint64(block.timestamp);
        pass.status = PassStatus.CoordinatorApproved;

        emit PassApprovedByCoordinator(passId, msg.sender, uint64(block.timestamp));
    }

    function approveAsLabIncharge(uint256 passId) external onlyRole(LAB_INCHARGE_ROLE) passExists(passId) {
        Pass storage pass = _passes[passId];
        require(pass.status == PassStatus.CoordinatorApproved, "GatePass: not awaiting lab incharge approval");

        pass.labIncharge = msg.sender;
        pass.labInchargeApprovedAt = uint64(block.timestamp);
        pass.status = PassStatus.LabApproved;

        emit PassApprovedByLabIncharge(passId, msg.sender, uint64(block.timestamp));
    }

    function approveAsDean(uint256 passId) external onlyRole(DEAN_ROLE) passExists(passId) {
        Pass storage pass = _passes[passId];
        require(pass.status == PassStatus.LabApproved, "GatePass: not awaiting dean approval");

        pass.dean = msg.sender;
        pass.deanApprovedAt = uint64(block.timestamp);
        pass.status = PassStatus.Approved;

        emit PassApprovedByDean(passId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Rejects a pass. Callable only by the role whose turn it
    ///         currently is (Coordinator/Lab Incharge/Dean), matching the
    ///         approval order enforced elsewhere in this contract.
    function rejectPass(uint256 passId, string calldata reason) external passExists(passId) {
        Pass storage pass = _passes[passId];
        PassStatus status = pass.status;

        if (status == PassStatus.Pending) {
            require(hasRole(COORDINATOR_ROLE, msg.sender), "GatePass: not coordinator");
        } else if (status == PassStatus.CoordinatorApproved) {
            require(hasRole(LAB_INCHARGE_ROLE, msg.sender), "GatePass: not lab incharge");
        } else if (status == PassStatus.LabApproved) {
            require(hasRole(DEAN_ROLE, msg.sender), "GatePass: not dean");
        } else {
            revert("GatePass: pass is not pending any approval");
        }

        pass.status = PassStatus.Rejected;

        emit PassRejected(passId, msg.sender, reason, uint64(block.timestamp));
    }

    /// @notice Revokes an already-approved pass, e.g. for misconduct.
    function revokePass(uint256 passId) external passExists(passId) {
        require(hasRole(DEAN_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender), "GatePass: not authorized to revoke");

        Pass storage pass = _passes[passId];
        require(pass.status == PassStatus.Approved, "GatePass: only approved passes can be revoked");

        pass.status = PassStatus.Revoked;
        pass.revokedBy = msg.sender;
        pass.revokedAt = uint64(block.timestamp);

        emit PassRevoked(passId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Reads a pass and its effective status, computing `Expired`
    ///         on the fly for passes whose validity window has elapsed.
    function verifyPass(uint256 passId)
        external
        view
        passExists(passId)
        returns (EffectiveStatus effectiveStatus, Pass memory pass)
    {
        pass = _passes[passId];

        if (pass.status == PassStatus.Approved && block.timestamp > pass.validTo) {
            effectiveStatus = EffectiveStatus.Expired;
        } else {
            effectiveStatus = EffectiveStatus(uint8(pass.status));
        }
    }

    function totalPasses() external view returns (uint256) {
        return _nextPassId - 1;
    }
}
