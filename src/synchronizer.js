export default class Synchronizer {
  constructor(machine, connector) {
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
    this.config = {
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
    // The tick time data of last few (freezeWait / fixedTick) ticks.
    // This is used to calculate the round trip time.
    this.tickTime = [];
    // The input queue. This stores the actions that needs to be run, separated
    // by tick ID.
    this.inputQueue = [];
    // The output queue. This stores the actions triggered by UI / etc...,
    // and sends it to the server.
    this.outputQueue = [];
    // The client list. Used by the host.
    this.clients = {};
    this.clientList = [];
    // Is the system frozen? How many clients are affecting the status?
    this.frozen = 0;
    // Is the system started?
    this.started = false;
    // Is this a host?
    this.host = false;
    // Timer objects
    this.dynamicPushTimer = null;
    this.dynamicTickTimer = null;
    this.fixedTickTimer = null;
  }
  addClient(client) {
    this.clients[client.id] = client;
    this.clientList.push(client);
  }
  removeClient(clientId) {
    let client = this.clients[clientId];
    this.clientList.splice(this.clientList.indexOf(client), 1);
    // Or we can call remove
    this.clients[clientId] = undefined;
  }
  // Only server should call this; clients will automatically call this
  // when connected.
  start() {
    this.started = true;
    if (this.host) {
      this.addClient({
        id: this.connector.getClientId(),
        rtt: 0,
        ackId: 0,
        lastTime: Date.now(),
        connected: true
      });
    }
    if (this.config.dynamic) {
      // If there are any backlogs in output buffer, process them now
      this.doPush();
      // If there are any backlogs in input buffer, process them too
      if (this.host && this.inputQueue.length > 0) {
        this.handleTick();
      }
    } else {
      // Start the tick timer..
      if (this.fixedTickTimer === null) {
        this.fixedTickTimer = setInterval(() => this.handleTick(),
          this.config.fixedTick);
      }
    }
  }
  // Stop the synchronizer. This will freeze all connected nodes.
  stop() {
    this.started = false;
    if (!this.config.dynamic && this.fixedTickTimer !== null) {
      // Clear the tick timer.
      clearInterval(this.fixedTickTimer);
      this.fixedTickTimer = null;
    }
  }
  // Queues and triggers the action created from UI / etc, ...
  push(action) {
    this.outputQueue.push(action);
    if (this.config.dynamic && this.dynamicPushTimer === null && this.started) {
      this.dynamicPushTimer = setTimeout(() => {
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
    if (this.host) {
      this.handlePush(this.outputQueue, this.connector.getClientId());
      this.outputQueue = [];
    } else {
      this.connector.push(this.outputQueue, this.connector.getHostId());
      this.outputQueue = [];
    }
  }
  // Handle push - add action, trigger tick, etc...
  handlePush(actions, clientId) {
    if (this.host) {
      // Push to host is only available for dynamic mode, since acknowledge
      // will send the data to host in fixed mode.
      if (!this.config.dynamic) return;
      let client = this.clients[clientId];
      if (client == null) {
        // Client doesn't exist. But where do we need to send the error?
        // TODO Add error processing mechanism
        throw new Error('Client ID ' + clientId + ' does not exist');
      }
      // Copy the contents to input queue. concat is pretty slow.
      for (let i = 0; i < actions.length; ++i) {
        this.inputQueue.push(actions[i]);
      }
      // Start the dynamic tick timer,
      if (this.dynamicTickTimer === null && this.started) {
        this.dynamicTickTimer = setTimeout(() => {
          this.dynamicTickTimer = null;
          this.handleTick();
        }, this.config.dynamicTickWait);
      }
    } else {
      // This means the host has sent the message...
      if (this.inputQueue.length === 0 ?
        (this.tickId + 1 !== actions.id) :
        (this.inputQueue[this.inputQueue.length - 1].id + 1 !== actions.id)
      ) {
        throw new Error('Wrong tick data received; desync occurred?');
      }
      this.inputQueue.push(actions);
      this.connector.ack({
        id: actions.id,
        actions: this.outputQueue
      }, this.connector.getHostId());
      this.outputQueue = [];
      // Cancel push timer if exists.
      if (this.config.dynamic && this.dynamicPushTimer != null) {
        clearTimeout(this.dynamicPushTimer);
        this.dynamicPushTimer = null;
      }
      // Handle tick immedately in dynamic mode.
      if (this.config.dynamic) this.handleTick();
    }
  }
  // Handles the tick - run state machine, empty queue, etc...
  handleTick() {
    if (this.host) {
      let currentTime = Date.now();
      // Host should check whether to hang, send input buffer to clients,
      // then process itself.
      for (let i = 0; i < this.clientList.length; ++i) {
        let client = this.clientList[i];
        if (client.lastTime + this.config.disconnectWait < currentTime) {
          // Forcefully disconnect the client
          // TODO
        }
        if (client.lastTime + this.config.freezeWait < currentTime) {
          // Freeze... In dynamic mode, we should start a tick timer to count
          // down to the disconnection.
          this.doFreeze(client);
        }
      }
      // If it's frozen, don't process it
      if (this.frozen) return;
      // Increment the tick ID
      this.tickId ++;
      this.tickTime.push(currentTime);
      // Remove tickTime entry until specified length is reached
      while (this.tickTime.length >
        this.config.freezeWait / this.config.fixedTick
      ) {
        this.tickTime.shift();
      }
      // Now, push the input buffer to the clients.
      let sendData = {
        id: this.tickId,
        actions: this.inputQueue
      };
      for (let i = 0; i < this.clientList.length; ++i) {
        if (this.clientList[i].id === this.connector.getHostId()) continue;
        this.connector.push(sendData, this.clientList[i].id);
      }
      // Done! process the data, and empty the input queue.
      for (let i = 0; i < this.inputQueue.length; ++i) {
        let action = this.inputQueue[i];
        this.machine.run(action);
      }
      this.inputQueue = [];
      // We're all done!
      // Send previous ACK right after handling the tick.
      // This will probably trigger 1-tick delay...
      this.handleAck({
        id: this.tickId,
        actions: this.outputQueue
      }, this.connector.getHostId());
      this.outputQueue = [];
    } else {
      // Do we have sufficient tick data? If not, freeze!
      if ((!this.config.dynamic &&
        this.inputQueue.length <= this.config.fixedBuffer) ||
        this.inputQueue.length === 0
      ) {
        // Insufficient data, freeze.
        this.doFreeze();
        return;
      }
      if (this.frozen) {
        this.doUnfreeze();
      }
      // Process input queue until we have no data remaining.
      while (this.inputQueue.length > this.config.fixedBuffer) {
        let frame = this.inputQueue.shift();
        this.tickId = frame.id;
        for (let i = 0; i < frame.length; ++i) {
          this.machine.run(frame.actions[i]);
        }
      }
      // Since machine will call push function by itself, we don't need to
      // handle it.
    }
  }
  doFreeze(client) {
    if (!this.host) {
      this.frozen = true;
    } else if (!client.frozen) {
      client.frozen = true;
      this.frozen += 1;
    }
  }
  doUnfreeze(client) {
    if (!this.host) {
      this.frozen = false;
    } else if (client.frozen) {
      client.frozen = false;
      this.frozen -= 1;
      if (this.frozen < 0) {
        throw new Error('Frozen is less than 0 - something went wrong!');
      }
    }
  }
  // Handle connection - add client, freeze, etc...
  handleConnect(data, clientId) {
    if (this.host) {
      if (this.clients[clientId] != null) {
        throw new Error('Client already joined');
      }
      // Create client information
      let client = {
        id: clientId,
        rtt: 0,
        ackId: this.tickId,
        lastTime: Date.now(),
        connected: false
      };
      this.addClient(client);
      // Freeze until client sends ACK.
      this.doFreeze(client);
      // Send client the state information.
      this.connector.sendConnect({
        state: this.machine.getState(),
        tickId: this.tickId,
        config: this.config
        // Nothing else is required for now
      }, clientId);
    } else {
      // Server has sent the startup state information.
      if (this.started) {
        throw new Error('Client startup already done; but server sent' +
          'connection info');
      }
      this.tickId = data.tickId;
      this.config = data.config;
      this.machine.loadState(data.state);
      this.start();
      // Send ACK right away
      this.connector.ack({
        id: this.tickId,
        actions: this.outputQueue
      }, this.connector.getHostId());
      this.outputQueue = [];
    }
  }
  // Handle disconnect - remove client, trigger action, etc...
  handleDisconnect(clientId) {
  }
  // Handle acknowledge - calculate RTT, add action, trigger tick, etc...
  handleAck(actions, clientId) {
    // Handle ACK; Only host will process it.
    if (!this.host) return;
    // ACK data has id and actions...
    let client = this.clients[clientId];
    if (client == null) {
      // Client doesn't exist. But where do we need to send the error?
      // TODO Add error processing mechanism
      throw new Error('Client ID ' + clientId + ' does not exist');
    }
    // Is this really necessary?
    // TCP will handle order issue, so we don't have to care about it
    if (actions == null || actions.id !== client.ackId + 1) {
      throw new Error('Wrong tick data received; order matching failed');
    }
    if (actions.id > this.tickId) {
      // Well, literally.
      throw new Error('Client is from the future');
    }
    client.ackId = actions.id;
    // Copy the contents to input queue. concat is pretty slow.
    for (let i = 0; i < actions.actions.length; ++i) {
      this.inputQueue.push(actions.actions[i]);
    }
    // Update RTT...
    if (client.connected) {
      client.rtt = Date.now() - this.tickTime[
        Math.max(0, this.tickTime.length - (this.tickId - actions.id))
      ];
    } else {
      client.rtt = Date.now() - client.lastTime;
      client.connected = true;
    }
    // Update last time.
    client.lastTime = Date.now();
    this.doUnfreeze(client);
    if (actions.actions.length !== 0 && this.config.dynamic) {
      // Start the dynamic tick timer,
      if (this.dynamicTickTimer === null && this.started) {
        this.dynamicTickTimer = setTimeout(() => {
          this.dynamicTickTimer = null;
          this.handleTick();
        }, this.config.dynamicTickWait);
      }
    }
  }
}
