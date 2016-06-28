import Synchronizer from '../src/synchronizer';

import LocalConnectorServer from './localConnectorServer';

import ReducerMachine from './reducerMachine';
import calculatorReducer from './calculatorReducer';

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

synchronizer.push(3);
synchronizer.push(3);
synchronizer.push('*');
