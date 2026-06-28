const { SimulationEngine } = require('./simulationEngine');

const activeSimulations = new Map();

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`📡 Client connected: ${socket.id}`);

    socket.on('start_simulation', ({ spacecraftId, config }) => {
      console.log(`🚀 Starting simulation for spacecraft: ${spacecraftId}`);
      
      if (activeSimulations.has(spacecraftId)) {
        activeSimulations.get(spacecraftId).stop();
      }

      const engine = new SimulationEngine(spacecraftId, config);
      activeSimulations.set(spacecraftId, engine);

      engine.start((telemetry) => {
        socket.emit('telemetry_update', telemetry);
      });

      socket.emit('simulation_started', { spacecraftId, timestamp: new Date().toISOString() });
    });

    socket.on('stop_simulation', ({ spacecraftId }) => {
      if (activeSimulations.has(spacecraftId)) {
        activeSimulations.get(spacecraftId).stop();
        activeSimulations.delete(spacecraftId);
        socket.emit('simulation_stopped', { spacecraftId });
      }
    });

    socket.on('inject_fault', ({ spacecraftId, fault }) => {
      if (activeSimulations.has(spacecraftId)) {
        activeSimulations.get(spacecraftId).injectFault(fault);
        socket.emit('fault_injected', { spacecraftId, fault });
      }
    });

    socket.on('join_mission', ({ missionId }) => {
      socket.join(`mission_${missionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`📡 Client disconnected: ${socket.id}`);
    });
  });
};

module.exports = { initSocket };
