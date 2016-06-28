import Synchronizer from '../src/synchronizer';

import LocalConnectorServer from './localConnectorServer';
import LocalConnectorClient from './localConnectorClient';

import ReducerMachine from './reducerMachine';
import calculatorReducer from './calculatorReducer';

function createServer() {
  let machine = new ReducerMachine(calculatorReducer);
  let connector = new LocalConnectorServer();

  let synchronizer = new Synchronizer(machine, connector, {
    dynamic: false,
    dynamicPushWait: 100,
    dynamicTickWait: 100,
    fixedTick: 1000,
    fixedBuffer: 1,
    disconnectWait: 10000,
    freezeWait: 2000
  });
  synchronizer.host = true;
  connector.synchronizer = synchronizer;
  synchronizer.start();
  return synchronizer;
}

function createClient(server) {
  let machine = new ReducerMachine(calculatorReducer);
  let connector = new LocalConnectorClient(server);

  let synchronizer = new Synchronizer(machine, connector);
  connector.synchronizer = synchronizer;
  return synchronizer;
}

let server = createServer();
let clients = [];
for (let i = 0; i < 3; ++i) {
  let client = createClient(server.connector);
  clients.push(client);
  client.connector.connect();
}

server.push(3);
server.push(3);
server.push('*');

let k = 0;
for (let i = 2; i >= 0; --i) {
  clients[i].push(k++);
  clients[i].push(k++);
  clients[i].push('+');
}
