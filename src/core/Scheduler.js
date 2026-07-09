export class Scheduler {
  constructor({ cron, logger }) {
    this.cron = cron;
    this.logger = logger;
    this.jobs = new Map();
  }

  every(expression, name, task) {
    const wrapped = async (...args) => {
      try {
        await task(...args);
      } catch (err) {
        this.logger.error({ err, job: name }, "scheduled task failed");
      }
    };
    const job = this.cron.schedule(expression, wrapped);
    this.jobs.set(name, job);
    return job;
  }

  stopAll() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }
}
