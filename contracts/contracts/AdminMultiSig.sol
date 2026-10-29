// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AdminMultiSig
/// @notice Minimal N-of-M multisig meant to hold GatePass's ADMIN_ROLE, so no
///         single wallet can unilaterally grant/revoke Coordinator, Lab
///         Incharge, Dean, or Backend roles. Any owner proposes a call to an
///         arbitrary target; it executes automatically once `required`
///         distinct owners have confirmed it.
contract AdminMultiSig {
    event ProposalCreated(uint256 indexed id, address indexed proposer, address target, bytes data);
    event ProposalConfirmed(uint256 indexed id, address indexed owner);
    event ProposalExecuted(uint256 indexed id);

    struct Proposal {
        address target;
        bytes data;
        uint256 confirmations;
        bool executed;
    }

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public required;

    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => bool)) private _confirmedBy;

    modifier onlyOwner() {
        require(isOwner[msg.sender], "AdminMultiSig: not an owner");
        _;
    }

    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "AdminMultiSig: owners required");
        require(_required > 0 && _required <= _owners.length, "AdminMultiSig: invalid threshold");

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "AdminMultiSig: zero owner");
            require(!isOwner[owner], "AdminMultiSig: duplicate owner");
            isOwner[owner] = true;
            owners.push(owner);
        }
        required = _required;
    }

    /// @notice Propose a call and automatically cast the proposer's confirmation.
    function propose(address target, bytes calldata data) external onlyOwner returns (uint256 proposalId) {
        proposalId = _proposals.length;
        _proposals.push(Proposal({target: target, data: data, confirmations: 0, executed: false}));
        emit ProposalCreated(proposalId, msg.sender, target, data);
        _confirm(proposalId);
    }

    /// @notice Confirm an existing proposal. Executes once `required` is reached.
    function confirm(uint256 proposalId) external onlyOwner {
        _confirm(proposalId);
    }

    function _confirm(uint256 proposalId) internal {
        require(proposalId < _proposals.length, "AdminMultiSig: unknown proposal");
        Proposal storage proposal = _proposals[proposalId];
        require(!proposal.executed, "AdminMultiSig: already executed");
        require(!_confirmedBy[proposalId][msg.sender], "AdminMultiSig: already confirmed");

        _confirmedBy[proposalId][msg.sender] = true;
        proposal.confirmations += 1;
        emit ProposalConfirmed(proposalId, msg.sender);

        if (proposal.confirmations >= required) {
            proposal.executed = true;
            (bool success, ) = proposal.target.call(proposal.data);
            require(success, "AdminMultiSig: execution failed");
            emit ProposalExecuted(proposalId);
        }
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(
        uint256 proposalId
    ) external view returns (address target, bytes memory data, uint256 confirmations, bool executed) {
        Proposal storage proposal = _proposals[proposalId];
        return (proposal.target, proposal.data, proposal.confirmations, proposal.executed);
    }

    function hasConfirmed(uint256 proposalId, address owner) external view returns (bool) {
        return _confirmedBy[proposalId][owner];
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }
}
