import Synchronizer from './synchronizer';

const debug = require('debug')('locksmith:hostSynchronizer');

export default class HostSynchronizer extends Synchronizer {
  constructor(machine, connector, config) {
    super(machine, connector, config);

    // The tick time data of last few (freezeWait / fixedTick) ticks.
    // This is used to calculate the round trip time.
    this.tickTime = [];

    this.host = true;
    this.hostQueue = [];

    this.clients = {};
    this.clientList = [];

    this.dynamicTickTimer = null;
  }
  addClient(client) {
    debug('Client added: ', client.id);
    this.clients[client.id] = client;
    this.clientList.push(client);
  }
  removeClient(clientId) {
    debug('Client removed', clientId);
    let client = this.clients[clientId];
    this.clientList.splice(this.clientList.indexOf(client), 1);
    // Or we can call remove
    this.clients[clientId] = undefined;
  }
  start() {
    debug('Adding itself into the clients list');
    this.addClient({
      id: this.connector.getClientId(),
      rtt: 0,
      ackId: 0,
      lastTime: Date.now(),
      connected: true
    });
    super.start();
    // If there are any backlogs in host buffer, process them
    if (this.config.dynamic && this.hostQueue.length > 0) {
      this.handleTick();
    }
  }
  doPush() {
    // Just send actions to itself
    if (!this.started || !this.config.dynamic) return;
    if (this.outputQueue.length === 0) return;
    debug('Dynamic mode: pushing actions to host');
    this.handlePush(this.outputQueue, this.connector.getClientId());
    this.outputQueue = [];
  }
  handlePush(actions, clientId) {
    // Push to host is only available for dynamic mode, since acknowledge
    // will send the data to host in fixed mode.
    if (!this.config.dynamic) return;
    let client = this.clients[clientId];
    if (client == null) {
      this.handleError('Client ID ' + clientId + ' does not exist',
        clientId);
      return;
    }
    if (!Array.isArray(actions)) {
      this.handleError('Actions value is not array', clientId);
      return;
    }
    debug('Received push from ', clientId);
    // Copy the contents to input queue. concat is pretty slow.
    for (let i = 0; i < actions.length; ++i) {
      let transformed = this.validateAction(actions[i], client);
      if (transformed === null) continue;
      this.hostQueue.push(transformed);
    }
    // Start the dynamic tick timer,
    if (!this.frozen && this.dynamicTickTimer === null && this.started) {
      debug('Starting tick timer');
      this.dynamicTickTimer = setTimeout(() => {
        debug('Tick timer completed');
        this.dynamicTickTimer = null;
        this.handleTick();
      }, this.config.dynamicTickWait);
    }
  }
  doAck(tickId) {
    this.connector.ack({
      id: tickId,
      actions: this.outputQueue
    }, this.connector.getClientId());
    this.outputQueue = [];
  }
  handleTick(actClient) {
    if (actClient) return super.handleTick();
    if (this.config.dynamic && this.hostQueue.length === 0) return;
    let currentTime = Date.now();
    // Host should check whether to hang, send input buffer to clients,
    // then process itself.
    for (let i = 0; i < this.clientList.length; ++i) {
      let client = this.clientList[i];
      // Client is matched up with the server; continue anyway.
      if (client.ackId === this.tickId) continue;
      // Ignore itself
      if (client.id === this.connector.getClientId()) continue;
      if (client.freezeTime &&
        client.freezeTime + this.config.disconnectWait < currentTime
      ) {
        debug('Client %d over disconnect threshold, disconnecting',
          client.id);
        // Forcefully disconnect the client
        this.connector.disconnect(client.id);
        this.handleDisconnect(client.id);
      } else if (client.lastTime + this.config.freezeWait < currentTime) {
        debug('Client %d over freeze threshold, freezing',
          client.id);
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
    debug('System not frozen; processing tick', this.tickId);
    // Remove tickTime entry until specified length is reached
    while (this.tickTime.length >
      this.config.freezeWait / this.config.fixedTick
    ) {
      this.tickTime.shift();
    }
    debug('Removing tickTime entry: %d left', this.tickTime.length);
    // Now, push the input buffer to the clients.
    let sendData = {
      id: this.tickId,
      actions: this.hostQueue,
      rtt: 0
    };
    this.hostQueue = [];
    debug('Pushing host queue', this.inputQueue);
    for (let i = 0; i < this.clientList.length; ++i) {
      if (this.clientList[i].id === this.connector.getHostId()) continue;
      this.connector.push(Object.assign({}, sendData, {
        rtt: this.clientList[i].rtt
      }), this.clientList[i].id);
    }
    super.handlePush(sendData, true);
    if (!this.config.dynamic) super.handleTick();
  }
  doFreeze(client) {
    if (client.frozen) return;
    client.frozen = true;
    client.freezeTime = Date.now();
    this.frozen += 1;
    debug('Freezing due to client %d, counter %d', client.id, this.frozen);
    if (this.frozen === 1) this.emit('freeze', client.id);
  }
  doUnfreeze(client) {
    if (!client.frozen) return;
    client.frozen = false;
    client.freezeTime = null;
    this.frozen -= 1;
    debug('Unfreezing client %d, counter %d', client.id, this.frozen);
    if (this.frozen === 0) this.emit('unfreeze', client.id);
    if (this.frozen < 0) {
      // This isn't client's fault - thus we throw an error.
      throw new Error('Frozen lower than 0 - something went wrong.');
    }
  }
  handleConnect(data, clientId) {
    if (this.clients[clientId] != null) {
      this.handleError('Client already joined', clientId);
      return;
    }
    debug('Client %d has joined', clientId);
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
    debug('Freezing until ACK received');
    this.doFreeze(client);
    // Send client the state information.
    debug('Sending current information');
    this.connector.connect({
      state: this.machine.getState(),
      tickId: this.tickId,
      config: this.config,
      // Send client ID along with the connect signal; this might be
      // used by connector.
      id: clientId
      // Nothing else is required for now
    }, clientId);
    this.emit('connect', clientId);
  }
  handleDisconnect(clientId) {
    let client = this.clients[clientId];
    if (client == null) {
      this.handleError('Client ID ' + clientId + ' does not exist',
        clientId);
      return;
    }
    debug('Client %d has disconnected', clientId);
    // Remove the client, that's all.
    this.removeClient(clientId);
    this.doUnfreeze(client);
    // Prehaps we should send disconnect event to other clients.
    this.emit('disconnect', clientId);
  }
  // Handle acknowledge - calculate RTT, add action, trigger tick, etc...
  handleAck(actions, clientId) {
    // Handle ACK; Only host will process it.
    if (!this.host) return;
    // ACK data has id and actions...
    let client = this.clients[clientId];
    if (client == null) {
      this.handleError('Client ID ' + clientId + ' does not exist',
        clientId);
      return;
    }
    debug('Handling ACK %d from client %d', actions.id, clientId);
    // Is this really necessary?
    // TCP will handle order issue, so we don't have to care about it
    if (actions == null ||
      (client.connected && actions.id !== client.ackId + 1)) {
      this.handleError('Wrong tick data received; order matching failed',
        clientId);
      return;
    }
    if (actions.id > this.tickId) {
      // Well, literally.
      this.handleError('Wrong tick data received; client is from future',
        clientId);
      return;
    }
    if (!Array.isArray(actions.actions)) {
      this.handleError('Actions field is not array', clientId);
      return;
    }
    if (client.connected) client.ackId = actions.id;
    debug('Client input queue:', actions.actions);
    // Copy the contents to input queue. concat is pretty slow.
    for (let i = 0; i < actions.actions.length; ++i) {
      let transformed = this.validateAction(actions.actions[i], client);
      if (transformed === undefined) continue;
      this.hostQueue.push(transformed);
    }
    // Update RTT...
    if (client.connected) {
      client.rtt = Date.now() - this.tickTime[
        Math.max(0, this.tickTime.length - (this.tickId - actions.id) - 1)
      ];
      debug('Update RTT:', client.rtt);
    } else {
      client.rtt = Date.now() - client.lastTime;
      client.connected = true;
      debug('Initial ack, update RTT:', client.rtt);
    }
    // Update last time.
    client.lastTime = Date.now();
    this.doUnfreeze(client);
    if (this.hostQueue.length !== 0 && this.config.dynamic) {
      // Start the dynamic tick timer,
      if (this.dynamicTickTimer === null && this.started) {
        debug('Starting tick timer');
        this.dynamicTickTimer = setTimeout(() => {
          debug('Tick timer completed');
          this.dynamicTickTimer = null;
          this.handleTick();
        }, this.config.dynamicTickWait);
      }
    }
  }
  handleError(error, clientId) {
    this.emit('error', error, clientId);
    this.connector.error(error, clientId);
  }
  validateAction(action, client) {
    if (this.actionHandler) {
      return this.actionHandler(action, client);
    }
    return action;
  }
}
