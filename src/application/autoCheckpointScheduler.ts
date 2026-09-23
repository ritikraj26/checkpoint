export interface AutoCheckpointConfiguration {
	enabled: boolean;
	idleMinutes: number;
}

export interface AutoCheckpointStatus extends AutoCheckpointConfiguration {
	pendingActivity: boolean;
	saveInProgress: boolean;
	lastActivityAt?: string;
	nextCheckpointAt?: string;
	lastCheckpointAt?: string;
	lastError?: string;
}

export interface SchedulerClock {
	now(): number;
	setTimeout(callback: () => void, delayMilliseconds: number): unknown;
	clearTimeout(handle: unknown): void;
}

const defaultClock: SchedulerClock = {
	now: () => Date.now(),
	setTimeout: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class AutoCheckpointScheduler {
	private configuration: AutoCheckpointConfiguration = { enabled: false, idleMinutes: 10 };
	private timer?: unknown;
	private pendingActivity = false;
	private saveInProgress = false;
	private lastActivity?: number;
	private nextCheckpoint?: number;
	private lastCheckpoint?: number;
	private lastError?: string;
	private immediateReason?: string;
	private disposed = false;

	constructor(
		private readonly save: (reason: string) => Promise<void>,
		private readonly onError: (error: unknown) => void = () => undefined,
		private readonly clock: SchedulerClock = defaultClock,
	) {}

	configure(configuration: AutoCheckpointConfiguration): void {
		if (this.disposed) {
			return;
		}
		this.configuration = {
			enabled: configuration.enabled,
			idleMinutes: normalizeIdleMinutes(configuration.idleMinutes),
		};
		this.clearTimer();
		if (!this.configuration.enabled) {
			this.pendingActivity = false;
			this.immediateReason = undefined;
			return;
		}
		this.schedulePendingWork();
	}

	recordActivity(): void {
		if (this.disposed || !this.configuration.enabled) {
			return;
		}
		this.pendingActivity = true;
		this.lastActivity = this.clock.now();
		this.immediateReason = undefined;
		if (!this.saveInProgress) {
			this.scheduleAt(this.lastActivity + this.idleMilliseconds());
		}
	}

	requestImmediate(reason: string): void {
		if (this.disposed || !this.configuration.enabled) {
			return;
		}
		this.pendingActivity = true;
		this.lastActivity = this.clock.now();
		this.immediateReason = reason;
		if (!this.saveInProgress) {
			this.clearTimer();
			void this.runSave();
		}
	}

	status(): AutoCheckpointStatus {
		return {
			...this.configuration,
			pendingActivity: this.pendingActivity,
			saveInProgress: this.saveInProgress,
			...(this.lastActivity === undefined ? {} : { lastActivityAt: toIso(this.lastActivity) }),
			...(this.nextCheckpoint === undefined ? {} : { nextCheckpointAt: toIso(this.nextCheckpoint) }),
			...(this.lastCheckpoint === undefined ? {} : { lastCheckpointAt: toIso(this.lastCheckpoint) }),
			...(this.lastError === undefined ? {} : { lastError: this.lastError }),
		};
	}

	dispose(): void {
		this.disposed = true;
		this.clearTimer();
		this.pendingActivity = false;
		this.immediateReason = undefined;
	}

	private schedulePendingWork(): void {
		if (!this.pendingActivity || this.saveInProgress) {
			return;
		}
		if (this.immediateReason) {
			void this.runSave();
			return;
		}
		const dueAt = (this.lastActivity ?? this.clock.now()) + this.idleMilliseconds();
		this.scheduleAt(dueAt);
	}

	private scheduleAt(dueAt: number): void {
		this.clearTimer();
		this.nextCheckpoint = dueAt;
		this.timer = this.clock.setTimeout(
			() => void this.runSave(),
			Math.max(0, dueAt - this.clock.now()),
		);
	}

	private async runSave(): Promise<void> {
		this.clearTimer();
		if (this.disposed || !this.configuration.enabled || !this.pendingActivity || this.saveInProgress) {
			return;
		}

		const reason = this.immediateReason ?? 'Automatic checkpoint after inactivity';
		this.immediateReason = undefined;
		this.pendingActivity = false;
		this.saveInProgress = true;
		try {
			await this.save(reason);
			this.lastCheckpoint = this.clock.now();
			this.lastError = undefined;
		} catch (error) {
			this.lastError = errorMessage(error);
			this.onError(error);
		} finally {
			this.saveInProgress = false;
			if (!this.disposed && this.configuration.enabled) {
				this.schedulePendingWork();
			}
		}
	}

	private idleMilliseconds(): number {
		return this.configuration.idleMinutes * 60_000;
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			this.clock.clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.nextCheckpoint = undefined;
	}
}

function normalizeIdleMinutes(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 10;
}

function toIso(value: number): string {
	return new Date(value).toISOString();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
