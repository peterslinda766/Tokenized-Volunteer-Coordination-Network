// hours-logger.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Log {
  eventId: number;
  taskId: number;
  volunteer: string;
  hours: number;
  startBlock: number;
  endBlock: number;
  metadata?: Uint8Array;
  status: string;
}

interface VolunteerLogs {
  logIds: number[];
}

interface ContractState {
  contractOwner: string;
  paused: boolean;
  totalLogs: number;
  logs: Map<number, Log>;
  volunteerLogs: Map<string, VolunteerLogs>; // Key: `${volunteer}-${eventId}`
  taskAssignments: Map<number, { assignees: string[] }>; // Not used in mock, but for completeness
  currentBlock: number;
}

// Mock trait implementations
class MockTaskManager {
  getTaskDetails(taskId: number): ClarityResponse<{ eventId: number; requiredSkills: string[]; status: string; endBlock?: number }> {
    // Mock data
    if (taskId === 1) {
      return { ok: true, value: { eventId: 1, requiredSkills: ["skill1"], status: "active", endBlock: undefined } };
    }
    return { ok: false, value: 201 };
  }

  isAssigned(taskId: number, volunteer: string): ClarityResponse<boolean> {
    if (taskId === 1 && volunteer === "volunteer_1") {
      return { ok: true, value: true };
    }
    return { ok: true, value: false };
  }
}

class MockVerificationContract {
  submitForVerification(eventId: number, taskId: number, volunteer: string, hours: number, metadata?: Uint8Array): ClarityResponse<number> {
    // Simulate success
    return { ok: true, value: 1 };
  }
}

// Mock contract
class HoursLoggerMock {
  private state: ContractState = {
    contractOwner: "deployer",
    paused: false,
    totalLogs: 0,
    logs: new Map(),
    volunteerLogs: new Map(),
    taskAssignments: new Map(),
    currentBlock: 1000,
  };

  private ERR_UNAUTHORIZED = 200;
  private ERR_INVALID_TASK = 201;
  private ERR_NOT_ASSIGNED = 202;
  private ERR_INVALID_HOURS = 203;
  private ERR_PAUSED = 204;
  private ERR_INTEGRATION_FAIL = 205;
  private ERR_OVERLAPPING_LOG = 206;
  private ERR_INVALID_PERIOD = 211;
  private ERR_MAX_LOGS_EXCEEDED = 212;
  private ERR_NOT_OWNER = 209;

  private MAX_HOURS_PER_LOG = 24;
  private MAX_LOGS_PER_VOLUNTEER = 50;
  private LOG_PERIOD_BLOCKS = 144;

  // Mock external calls
  private taskManager: MockTaskManager = new MockTaskManager();
  private verificationContract: MockVerificationContract = new MockVerificationContract();

  advanceBlock(blocks: number = 1): void {
    this.state.currentBlock += blocks;
  }

  logHours(
    caller: string,
    eventId: number,
    taskId: number,
    hours: number,
    startBlock: number,
    endBlock: number,
    metadata?: Uint8Array,
    taskManagerAddr: string, // Ignored in mock
    verificationAddr: string // Ignored in mock
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const taskDetails = this.taskManager.getTaskDetails(taskId);
    if (!taskDetails.ok) {
      return { ok: false, value: this.ERR_INVALID_TASK };
    }
    if (taskDetails.value.eventId !== eventId) {
      return { ok: false, value: this.ERR_INVALID_TASK };
    }
    const isAssigned = this.taskManager.isAssigned(taskId, caller);
    if (!isAssigned.value) {
      return { ok: false, value: this.ERR_NOT_ASSIGNED };
    }
    if (hours <= 0 || hours > this.MAX_HOURS_PER_LOG) {
      return { ok: false, value: this.ERR_INVALID_HOURS };
    }
    if (endBlock <= startBlock || endBlock - startBlock > this.LOG_PERIOD_BLOCKS) {
      return { ok: false, value: this.ERR_INVALID_PERIOD };
    }
    const volKey = `${caller}-${eventId}`;
    const volLogs = this.state.volunteerLogs.get(volKey) ?? { logIds: [] };
    if (volLogs.logIds.length >= this.MAX_LOGS_PER_VOLUNTEER) {
      return { ok: false, value: this.ERR_MAX_LOGS_EXCEEDED };
    }
    // Check overlap
    const noOverlap = volLogs.logIds.every((logId) => {
      const log = this.state.logs.get(logId);
      return log ? (startBlock >= log.endBlock || endBlock <= log.startBlock) : true;
    });
    if (!noOverlap) {
      return { ok: false, value: this.ERR_OVERLAPPING_LOG };
    }

    const logId = this.state.totalLogs + 1;
    this.state.logs.set(logId, {
      eventId,
      taskId,
      volunteer: caller,
      hours,
      startBlock,
      endBlock,
      metadata,
      status: "logged",
    });
    volLogs.logIds.push(logId);
    this.state.volunteerLogs.set(volKey, volLogs);
    this.state.totalLogs = logId;

    const submitResult = this.verificationContract.submitForVerification(eventId, taskId, caller, hours, metadata);
    if (!submitResult.ok) {
      return { ok: false, value: this.ERR_INTEGRATION_FAIL };
    }
    const log = this.state.logs.get(logId)!;
    log.status = "submitted";
    return { ok: true, value: logId };
  }

  updateLogStatus(caller: string, logId: number, newStatus: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const log = this.state.logs.get(logId);
    if (!log) {
      return { ok: false, value: this.ERR_INVALID_TASK };
    }
    log.status = newStatus;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  transferOwnership(caller: string, newOwner: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.contractOwner = newOwner;
    return { ok: true, value: true };
  }

  getLogDetails(logId: number): ClarityResponse<Log | null> {
    return { ok: true, value: this.state.logs.get(logId) ?? null };
  }

  getVolunteerLogs(volunteer: string, eventId: number): ClarityResponse<number[] | null> {
    const volKey = `${volunteer}-${eventId}`;
    return { ok: true, value: this.state.volunteerLogs.get(volKey)?.logIds ?? null };
  }

  getTotalLogs(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalLogs };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getContractOwner(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractOwner };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  volunteer1: "volunteer_1",
  unauthorized: "unauthorized",
};

describe("HoursLogger Contract", () => {
  let contract: HoursLoggerMock;

  beforeEach(() => {
    contract = new HoursLoggerMock();
    vi.resetAllMocks();
  });

  it("should allow volunteer to log hours successfully", () => {
    const result = contract.logHours(
      accounts.volunteer1,
      1,
      1,
      5,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    expect(result).toEqual({ ok: true, value: 1 });
    const log = contract.getLogDetails(1);
    expect(log).toEqual({
      ok: true,
      value: expect.objectContaining({
        eventId: 1,
        taskId: 1,
        volunteer: accounts.volunteer1,
        hours: 5,
        status: "submitted",
      }),
    });
  });

  it("should prevent logging with invalid hours", () => {
    const result = contract.logHours(
      accounts.volunteer1,
      1,
      1,
      0,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    expect(result).toEqual({ ok: false, value: 203 });
  });

  it("should prevent logging if not assigned", () => {
    const result = contract.logHours(
      accounts.unauthorized,
      1,
      1,
      5,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    expect(result).toEqual({ ok: false, value: 202 });
  });

  it("should detect overlapping logs", () => {
    contract.logHours(
      accounts.volunteer1,
      1,
      1,
      5,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    const overlapResult = contract.logHours(
      accounts.volunteer1,
      1,
      1,
      3,
      1003,
      1006,
      undefined,
      "task_manager",
      "verification"
    );
    expect(overlapResult).toEqual({ ok: false, value: 206 });
  });

  it("should enforce max logs per volunteer", () => {
    for (let i = 0; i < 50; i++) {
      contract.logHours(
        accounts.volunteer1,
        1,
        1,
        1,
        1000 + i * 10,
        1001 + i * 10,
        undefined,
        "task_manager",
        "verification"
      );
    }
    const excessResult = contract.logHours(
      accounts.volunteer1,
      1,
      1,
      1,
      1500,
      1501,
      undefined,
      "task_manager",
      "verification"
    );
    expect(excessResult).toEqual({ ok: false, value: 212 });
  });

  it("should allow owner to update log status", () => {
    contract.logHours(
      accounts.volunteer1,
      1,
      1,
      5,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    const updateResult = contract.updateLogStatus(accounts.deployer, 1, "verified");
    expect(updateResult).toEqual({ ok: true, value: true });
    const log = contract.getLogDetails(1);
    expect(log.value?.status).toBe("verified");
  });

  it("should prevent non-owner from updating status", () => {
    const updateResult = contract.updateLogStatus(accounts.unauthorized, 1, "verified");
    expect(updateResult).toEqual({ ok: false, value: 209 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const logDuringPause = contract.logHours(
      accounts.volunteer1,
      1,
      1,
      5,
      1000,
      1005,
      undefined,
      "task_manager",
      "verification"
    );
    expect(logDuringPause).toEqual({ ok: false, value: 204 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
  });

  it("should transfer ownership", () => {
    const transferResult = contract.transferOwnership(accounts.deployer, accounts.volunteer1);
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getContractOwner()).toEqual({ ok: true, value: accounts.volunteer1 });
  });
});