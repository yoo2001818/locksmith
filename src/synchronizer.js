import { EventEmitter } from 'events';

const debug = require('debug')('locksmith:synchronizer');

export default class Synchronizer extends EventEmitter {
  constructor(machine, connector, config) {
    super();
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
     * - run(action) - Runs the machine with provided action.
     */
    this.machine = machine;
    // The connector interface, used to communicate with other devices.
    this.connector = connector;
    // The default configuration to use. This needs to be set to communicate,
    // however, clients may automatically receive the configuration at
    // connection time if the protocol supports it.
    // The configuration object is pure JSON object, so it can be easily
    // serialized.
    this.config = config || {
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
    // Is the system frozen? How many clients are affecting the status?
    this.frozen = 0;
    // Is the system started?
    this.started = false;
    // Timer objects
    this.dynamicPushTimer = null;
    this.fixedTickTimer = null;
  }
  // Only server should call this; clients will automatically call this
  // when connected.
  start() {
    debug('Synchronizer starting');
    this.started = true;
    this.emit('start');
    if (this.config.dynamic) {
      debug('Dynamic mode: processing backlogs');
      // If there are any backlogs in output buffer, process them now
      this.doPush();
    } else {
      // Start the tick timer..
      if (this.fixedTickTimer === null) {
        debug('Fixed mode: starting tick timer');
        this.fixedTickTimer = setInterval(() => this.handleTick(),
          this.config.fixedTick);
      }
    }
  }
  // Stop the synchronizer. This will freeze all connected nodes.
  stop() {
    this.started = false;
    debug('Stopping synchronizer');
    this.emit('stop');
    if (!this.config.dynamic && this.fixedTickTimer !== null) {
      // Clear the tick timer.
      clearInterval(this.fixedTickTimer);
      this.fixedTickTimer = null;
    }
  }
  // Queues and triggers the action created from UI / etc, ...
  push(action) {
    debug('Push:', action);
    this.outputQueue.push(action);
    if (this.config.dynamic && this.dynamicPushTimer === null && this.started) {
      debug('Dynamic mode: starting push timer');
      this.dynamicPushTimer = setTimeout(() => {
        debug('Push timer completed');
        this.dynamicPushTimer = null;
        this.doPush();
      }, this.config.dynamicPushWait);
    }
  }
  // Actually pushes the data to the server. This is only required for
  // dynamic mode.
  doPush() {
    if (!this.started || !this.config.dynamic) return;
    if (this.outputQueue.length === 0) return;
    debug('Dynamic mode: pushing actions to host');
    this.connector.push(this.outputQueue, this.connector.getHostId());
    this.outputQueue = [];
  }
  // Handle push - add action, trigger tick, etc...
  handlePush(actions, suspressTick) {
    // This means the host has sent the message...
    if (!suspressTick && (this.inputQueue.length === 0 ?
      (this.tickId + 1 !== actions.id) :
      (this.inputQueue[this.inputQueue.length - 1].id + 1 !== actions.id)
    )) {
      this.connector.error('Wrong tick data received; desync occurred?',
        this.connector.getHostId());
      return;
    }
    debug('Received push from the server');
    this.inputQueue.push(actions);
    this.doAck(actions.id);
    // Cancel push timer if exists.
    if (this.config.dynamic && this.dynamicPushTimer != null) {
      debug('Cancelling push timer');
      clearTimeout(this.dynamicPushTimer);
      this.dynamicPushTimer = null;
    }
    // Handle tick immedately in dynamic mode.
    if (this.config.dynamic) this.handleTick(true);
  }
  doAck(tickId) {
    this.connector.ack({
      id: tickId,
      actions: this.outputQueue
    }, this.connector.getHostId());
    this.outputQueue = [];
  }
  // Handles the tick - run state machine, empty queue, etc...
  handleTick() {
    // Do we have sufficient tick data? If not, freeze!
    if ((!this.config.dynamic &&
      this.inputQueue.length <= this.config.fixedBuffer) ||
      this.inputQueue.length === 0
    ) {
      // Insufficient data, freeze.
      debug('Insufficient data in buffer; freezing.');
      this.doFreeze();
      return;
    }
    if (this.frozen) {
      debug('Data received; unfreezing.');
      this.doUnfreeze();
    }
    // Process input queue until we have no data remaining.
    while (this.inputQueue.length > this.config.fixedBuffer) {
      let frame = this.inputQueue.shift();
      this.tickId = frame.id;
      debug('Processing tick', frame.id, frame.actions);
      for (let i = 0; i < frame.actions.length; ++i) {
        this.machine.run(frame.actions[i]);
      }
      this.emit('tick', this.tickId);
    }
    // Since machine will call push function by itself, we don't need to
    // handle it.
  }
  doFreeze() {
    if (!this.frozen) return;
    this.frozen = true;
    this.emit('freeze');
  }
  doUnfreeze() {
    this.frozen = false;
    this.emit('unfreeze');
  }
  // Handle connection - add client, freeze, etc...
  handleConnect(data) {
    // Server has sent the startup state information.
    if (this.started) {
      this.connector.error('Client startup already done; but server sent' +
        'connection info', this.connector.getHostId());
      return;
    }
    debug('Connect event received', data.tickId);
    debug(data.config);
    this.tickId = data.tickId;
    this.config = data.config;
    this.machine.loadState(data.state);
    this.start();
    debug('Sending connect ACK');
    // Send ACK right away
    this.connector.ack({
      id: this.tickId,
      actions: this.outputQueue
    }, this.connector.getHostId());
    this.outputQueue = [];
    this.emit('connect');
  }
  // Handle disconnect - remove client, trigger action, etc...
  handleDisconnect() {
    // Disconnected...
    debug('Disconnected from the server, stopping');
    this.stop();
    this.emit('disconnect');
  }

}
