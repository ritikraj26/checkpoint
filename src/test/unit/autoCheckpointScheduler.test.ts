import * as assert from 'node:assert/strict';
import { AutoCheckpointScheduler, SchedulerClock } from '../../application/autoCheckpointScheduler';

suite('automatic checkpoint scheduler', () => {
	test('debounces activity until the configured idle interval', async () => {
		const clock = new FakeClock();
		const reasons: string[] = [];
		const scheduler = new AutoCheckpointScheduler(async (reason) => {
			reasons.push(reason);
		}, undefined, clock);
		scheduler.configure({ enabled: true, idleMinutes: 1 });

		scheduler.recordActivity();
		clock.advance(30_000);
		scheduler.recordActivity();
		clock.advance(59_999);
		assert.deepEqual(reasons, []);

		clock.advance(1);
		await settle();
		assert.deepEqual(reasons, ['Automatic checkpoint after inactivity']);
		assert.equal(scheduler.status().pendingActivity, false);
	});

	test('creates an immediate baseline without waiting for idle time', async () => {
		const clock = new FakeClock();
		const reasons: string[] = [];
		const scheduler = new AutoCheckpointScheduler(async (reason) => {
			reasons.push(reason);
		}, undefined, clock);
		scheduler.configure({ enabled: true, idleMinutes: 10 });

		scheduler.requestImmediate('Automatic facts-only baseline');
		await settle();

		assert.deepEqual(reasons, ['Automatic facts-only baseline']);
		assert.equal(scheduler.status().lastCheckpointAt, '1970-01-01T00:00:00.000Z');
	});

	test('does not overlap saves and follows up after activity during a save', async () => {
		const clock = new FakeClock();
		const completions: Array<() => void> = [];
		let activeSaves = 0;
		let maximumActiveSaves = 0;
		let saveCount = 0;
		const scheduler = new AutoCheckpointScheduler(() => {
			saveCount += 1;
			activeSaves += 1;
			maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
			return new Promise<void>((resolve) => completions.push(() => {
				activeSaves -= 1;
				resolve();
			}));
		}, undefined, clock);
		scheduler.configure({ enabled: true, idleMinutes: 1 });

		scheduler.recordActivity();
		clock.advance(60_000);
		assert.equal(saveCount, 1);
		scheduler.recordActivity();
		clock.advance(60_000);
		assert.equal(saveCount, 1);

		completions.shift()?.();
		await settle();
		clock.advance(0);
		assert.equal(saveCount, 2);
		assert.equal(maximumActiveSaves, 1);

		completions.shift()?.();
		await settle();
	});

	test('applies runtime configuration changes to pending work', async () => {
		const clock = new FakeClock();
		let saveCount = 0;
		const scheduler = new AutoCheckpointScheduler(async () => {
			saveCount += 1;
		}, undefined, clock);
		scheduler.configure({ enabled: true, idleMinutes: 10 });
		scheduler.recordActivity();
		clock.advance(60_000);

		scheduler.configure({ enabled: true, idleMinutes: 1 });
		clock.advance(0);
		await settle();
		assert.equal(saveCount, 1);

		scheduler.recordActivity();
		scheduler.configure({ enabled: false, idleMinutes: 1 });
		clock.advance(60_000);
		assert.equal(saveCount, 1);
		assert.equal(scheduler.status().pendingActivity, false);
	});

	test('cancels pending work when disposed', () => {
		const clock = new FakeClock();
		let saveCount = 0;
		const scheduler = new AutoCheckpointScheduler(async () => {
			saveCount += 1;
		}, undefined, clock);
		scheduler.configure({ enabled: true, idleMinutes: 1 });
		scheduler.recordActivity();

		scheduler.dispose();
		clock.advance(60_000);

		assert.equal(saveCount, 0);
		assert.equal(scheduler.status().pendingActivity, false);
	});

	test('reports save errors without throwing from a timer', async () => {
		const clock = new FakeClock();
		let reported: unknown;
		const scheduler = new AutoCheckpointScheduler(
			async () => { throw new Error('capture failed'); },
			(error) => { reported = error; },
			clock,
		);
		scheduler.configure({ enabled: true, idleMinutes: 1 });
		scheduler.recordActivity();

		clock.advance(60_000);
		await settle();

		assert.equal((reported as Error).message, 'capture failed');
		assert.equal(scheduler.status().lastError, 'capture failed');
		assert.equal(scheduler.status().saveInProgress, false);
	});
});

class FakeClock implements SchedulerClock {
	private current = 0;
	private nextId = 1;
	private readonly timers = new Map<number, { dueAt: number; callback: () => void }>();

	now(): number {
		return this.current;
	}

	setTimeout(callback: () => void, delayMilliseconds: number): unknown {
		const id = this.nextId;
		this.nextId += 1;
		this.timers.set(id, { dueAt: this.current + delayMilliseconds, callback });
		return id;
	}

	clearTimeout(handle: unknown): void {
		this.timers.delete(handle as number);
	}

	advance(milliseconds: number): void {
		this.current += milliseconds;
		const due = [...this.timers.entries()]
			.filter(([, timer]) => timer.dueAt <= this.current)
			.sort((left, right) => left[1].dueAt - right[1].dueAt);
		for (const [id, timer] of due) {
			if (this.timers.delete(id)) {
				timer.callback();
			}
		}
	}
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
