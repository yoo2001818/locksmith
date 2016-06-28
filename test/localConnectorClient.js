export default class LocalConnectorClient {
  constructor(server, delay) {
    this.server = server;
    this.delay = delay;
    this.clientId = server.clients ++;
    server.on('push', (data, target) => {
      if (this.clientId !== target) return;
      setTimeout(() => this.synchronizer.handlePush(data, target),
        this.delay);
    });
    server.on('ack', (data, target) => {
      if (this.clientId !== target) return;
      setTimeout(() => this.synchronizer.handleAck(data, target),
        this.delay);
    });
    server.on('connect', (data, target) => {
      if (this.clientId !== target) return;
      setTimeout(() => this.synchronizer.handleConnect(data, target),
        this.delay);
    });
    server.on('disconnect', (target) => {
      if (this.clientId !== target) return;
      setTimeout(() => this.synchronizer.handleDisconnect(target),
        this.delay);
    });
  }
  setSynchronizer(synchronizer) {
    this.synchronizer = synchronizer;
  }
  getHostId() {
    return 0;
  }
  getClientId() {
    return this.clientId;
  }
  push(data) {
    setTimeout(() => this.server.handlePush(data, this.clientId), this.delay);
  }
  ack(data) {
    setTimeout(() => this.server.handleAck(data, this.clientId), this.delay);
  }
  connect(data) {
    setTimeout(() => this.server.handleConnect(data, this.clientId),
      this.delay);
  }
  disconnect() {
    setTimeout(() => this.server.handleDisconnect(this.clientId), this.delay);
  }
}
