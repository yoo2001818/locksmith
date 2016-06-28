export default class LocalConnectorClient {
  constructor(server) {
    this.server = server;
    this.clientId = server.clients ++;
    server.on('push', (data, target) => {
      if (this.clientId !== target) return;
      this.synchronizer.handlePush(data, target);
    });
    server.on('ack', (data, target) => {
      if (this.clientId !== target) return;
      this.synchronizer.handleAck(data, target);
    });
    server.on('connect', (data, target) => {
      if (this.clientId !== target) return;
      this.synchronizer.handleConnect(data, target);
    });
    server.on('disconnect', (target) => {
      if (this.clientId !== target) return;
      this.synchronizer.handleDisconnect(target);
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
    this.server.handlePush(data, this.clientId);
  }
  ack(data) {
    this.server.handleAck(data, this.clientId);
  }
  connect(data) {
    this.server.handleConnect(data, this.clientId);
  }
  disconnect() {
    this.server.handleDisconnect(this.clientId);
  }
}
