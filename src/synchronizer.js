export default class Synchronizer {
  constructor(machine) {
    /**
     * The deterministic state machine to use. Note that it MUST be
     * deterministic, or the synchronization won't work at all! It shouldn't
     * use any dynamic information not from the 'action' itself, which includes
     * current time, etc. It's okay to use constant values though.
     *
     * TIP: It's okay to use pseudo-random generator as long as you keep the
     * random seed in the machine state.
     *
     * The machine object should use following functions in order to work:
     * - getState() - Returns current serializable (or serialized) machine
     *   state.
     * - loadState(state) - Overwrites the machine state with provided
     *   serializable (or serialized) data. performing loadState and getState
     *   must produce same state!
     * - run(action) - Runs the machine with provided action. This may trigger
     *   another action (such as feedback). If so, the machine object should
     *   keep the another action in the queue. Single feedback action is
     *   shared between all devices, so it should only be used if the actions
     *   are being created differently for each device.
     * - getActions() - Returns and empties the action queue.
     */
    this.machine = machine;
    // The default configuration to use. This needs to be set to communicate,
    // however, clients may automatically receive the configuration at
    // connection time if the protocol supports it.
    // The configuration object is pure JSON object, so it can be easily
    // serialized.
    this.configuration = {
      // If true, the tick only triggers when there is an action. This is useful
      // if tick shouldn't happen often.
      dynamic: true,
      // How long it should wait to push triggered action? Too low value can
      // take too much network bandwidth, too high value increases the
      // response time. (Dynamic mode)
      dynamicPushWait: 10,
      // How long the server should wait to trigger new tick? Too low value can
      // take too much network bandwidth, too high value increases the
      // response time. (Dynamic mode)
      dynamicTickWait: 10,
      // How often does the tick occur? Too low value can
      // take too much network bandwidth, too high value increases the
      // response time. (Fixed mode)
      fixedTick: 50,
      // How much should it store the tick/push event in the buffer?
      // This is used to mitigate network jittering. (Client, Fixed mode)
      fixedBuffer: 1,
      // How long should it wait before disconnecting not responding client?
      // High value can freeze the system for too long time, low value can
      // disconnect the client even if it doesn't have any problem.
      disconnectWait: 10000,
      // How long should it wait before start freezing and waiting
      // for acknowledge? Too low value can slow down the system, too high
      // value can explode the network buffer.
      freezeWait: 1000
    };
    // The tick ID. This increments by 1 every tick, and is used to
    this.tickId = 0;
    // The input queue. This stores the actions that needs to be run, separated
    // by tick ID.
    this.inputQueue = [];
    // The output queue. This stores the actions triggered by UI / etc...,
    // and sends it to the server.
    this.outputQueue = [];
    // Is the system frozen?
    this.frozen = true;
  }
  // Queues and triggers the action created from UI / etc, ...
  trigger(action) {
  }
  // Handles the tick - run state machine, empty queue, etc...
  handleTick() {
  }
  // Handle connection - add client, freeze, etc...
  handleConnect(state, issuer) {
  }
  // Handle connection ack - calculate RTT, trigger action, etc...
  handleConnectAck(issuer) {
  }
  // Handle disconnect - remove client, trigger action, etc...
  handleDisconnect(issuer) {
  }
  // Handle acknowledge - calculate RTT, add action, trigger tick, etc...
  handleAck(actions, issuer) {
  }
  // Handle push - add action, trigger tick, etc...
  handlePush(actions, issuer) {
  }
}
