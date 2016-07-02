import HostSynchronizer from '../src/hostSynchronizer';

import LocalConnectorServer from './localConnectorServer';

import ReducerMachine from './reducerMachine';
import calculatorReducer from './calculatorReducer';

let machine = new ReducerMachine(calculatorReducer);
let connector = new LocalConnectorServer();

let synchronizer = new HostSynchronizer(machine, connector, {
  dynamic: true,
  dynamicPushWait: 100,
  dynamicTickWait: 100,
  fixedTick: 1000,
  fixedBuffer: 0,
  disconnectWait: 10000,
  freezeWait: 2000
});
connector.synchronizer = synchronizer;
synchronizer.actionHandler = (action, client) => {
  console.log(action, client);
  if (typeof action === 'object') {
    return Object.assign({}, action, {
      clientId: client.id
    });
  }
  return action;
};
synchronizer.start();

synchronizer.push(3);
synchronizer.push(3);
synchronizer.push({
  data: '*'
}, true)
.then(state => {
  console.log('Success!');
  console.log(state);
});
