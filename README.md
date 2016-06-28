# locksmith
Lockstep deterministic state machine synchronization library

Locksmith is a simple library to synchronize the state between several devices.
It's can be used to sync game state,
[Redux](https://github.com/reactjs/redux) state, etc. It can be used if the
target is fully deterministic - Same input should produce same output.

# Usage

## Connector
First, you need to create a connector to connect between the protocol
(Which can be anything) and the synchronizer.

Note that the connector is used to communicate between server and client,
synchronizer doesn't support peer to peer protocol yet!

The connector should implement following functions:

- getHostId() - Returns the host's client ID.
- getClientId() - Returns the client's own client ID (which is given by the
  connector)
- push(data, targetId) - Executes `synchronizer.handlePush(data, senderId)`
  on target.
- ack(data, targetId) - Executes `synchronizer.handleAck(data, senderId)`
  on target.
- connect(data, targetId) - Executes
  `synchronizer.handleConnect(data, senderId)` on target. If the connection
  hasn't made, it should connect to the target.
- disconnect(targetId) - Executes `synchronizer.handleDisconnect(senderId)`
  on target. The connection should be closed, of course.
- error(data, targetId) - Handles the error. It may send the error to target,
  or just print it on the console.

## Machine
Then, you need to create a machine object to process the action and the state.

The machine should implement following functions:

- getState() - Returns serialized machine state.
- loadState(state) - Loads the serialized state into the machine.
- run(action) - Runs the action, and mutates the state information.

The state and action should be serializable objects - JSON is preferred,
however, anything can be used as long as the connector can process it.

### Action
Actions are processed with FIFO order (First-come-first-served), however,
still action order conflicts can occur. Machine should be able to process
the action normally even if action conflict occurs. Synchronizer should
provide a way to sort the actions, but it's work in progress.

## Combining
Lastly, combine everything together to create a synchronizer.

You don't need to specify the options in the client, as server sends the
options on connection.

### Server
```js
import Synchronizer from 'locksmith';

let machine = new Machine();
let connector = new Connector();

let synchronizer = new Synchronizer(machine, connector, {
  dynamic: false,
  dynamicPushWait: 10,
  dynamicTickWait: 10,
  fixedTick: 50,
  fixedBuffer: 1,
  disconnectWait: 10000,
  freezeWait: 1000
});
synchronizer.host = true;
connector.synchronizer = synchronizer;

synchronizer.start();
```

### Client
```js
import Synchronizer from 'locksmith';

let machine = new Machine();
let connector = new Connector();

let synchronizer = new Synchronizer(machine, connector);
connector.synchronizer = synchronizer;

connector.connect();
```

# Configuration
Synchronizer has number of options that changes the behavior of synchronization.

- dynamic: Boolean - If true, use dynamic mode instead of fixed mode.
  Dynamic mode trigger the tick only when a client sends actions, thus saving
  unnecessary data transfer if actions doesn't occur a lot.
- dynamicPushWait: Number - How much should the client wait to push actions
  to server?
- dynamicTickWait: Number - When a push was received, how much should the host
  wait to trigger a tick?
- fixedTick: Number - How often does the tick happen in fixed mode?
- fixedBuffer: Number - How many ticks should the client buffer?
- disconnectWait: Number - How long should the host wait to disconnect
  not responding client?
- freezeWait: Number - How long should the host wait for acknowledge without
  freezing?
