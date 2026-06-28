const Bull = require('bull');
const config = require('../config');
const logger = require('../monitoring/logger');
const { activeSimulations } = require('../monitoring/metrics');

const simulationQueue = new Bull('spacecraft-simulations', {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  limiter: {
    max: config.simulation.maxConcurrent,
    duration: 1000,
  },
});

simulationQueue.on('completed', (job) => {
  logger.info('Simulation job completed', { jobId: job.id, spacecraftId: job.data.spacecraftId });
  activeSimulations.dec();
});

simulationQueue.on('failed', (job, err) => {
  logger.error('Simulation job failed', { jobId: job.id, spacecraftId: job.data?.spacecraftId, error: err.message });
  activeSimulations.dec();
});

simulationQueue.on('active', (job) => {
  activeSimulations.inc();
});

const addSimulationJob = async (spacecraftId, config) => {
  const job = await simulationQueue.add({ spacecraftId, config }, {
    jobId: `sim_${spacecraftId}`,
    removeOnComplete: true,
  });
  logger.info('Simulation job queued', { jobId: job.id, spacecraftId });
  return job;
};

const removeSimulationJob = async (spacecraftId) => {
  const job = await simulationQueue.getJob(`sim_${spacecraftId}`);
  if (job) await job.remove();
};

module.exports = { simulationQueue, addSimulationJob, removeSimulationJob };
