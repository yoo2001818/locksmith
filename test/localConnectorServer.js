import { EventEmitter } from 'events';

export default class LocalConnectorServer extends EventEmitter {
  constructor() {
    super();
    this.clients = 1;
  }
  setSynchronizer(synchronizer) {
    this.synchronizer = synchronizer;
  }
  getHostId() {
    return 0;
  }
  getClientId() {
    return 0;
  }
  push(data, target) {
    this.emit('push', data, target);
  }
  ack(data, target) {
    this.emit('ack', data, target);
  }
  connect(data, target) {
    this.emit('connect', data, target);
  }
  disconnect(target) {
    this.emit('disconnect', target);
  }
  error(data, target) {
    console.log('Error to ' + target + ': ' + data);
  }
  handlePush(data, target) {
    this.synchronizer.handlePush(data, target);
  }
  handleConnect(data, target) {
    this.synchronizer.handleConnect(data, target);
  }
  handleDisconnect(target) {
    this.synchronizer.handleDisconnect(target);
  }
  handleAck(data, target) {
    this.synchronizer.handleAck(data, target);
  }
}
