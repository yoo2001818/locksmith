import { EventEmitter } from 'events';

export default class LocalConnectorServer extends EventEmitter {
  constructor() {
    super();
  }
  setSynchronizer(synchronizer) {
    this.synchornizer = synchronizer;
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
  sendConnect(data, target) {
    this.emit('connect', data, target);
  }
}
