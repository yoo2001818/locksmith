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
- error(data, targetId) - Handles the error. It may send the error to target
  (Execute `synchronizer.handleError(error)`), or just print it on the console.
  Error is a plain string object.

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

## Action validation / transformation
Host synchronizer can opt to validate / transform actions by setting
`actionHandler(action, client): Object` property. If it returns `undefined` (not
`null`), the action will be ignored. Returned object from the function will
be used as action instead.

In order to make `push` function Promise, `clientId` value must be present.
Also, since it must store Promise ID, `promiseId` value must be not occupied.

## Connection validation
Host synchronizer can also opt to connection validation by setting
`connectionHandler(meta, client): Object` property. It should return modified
(or original) metadata object, or it should throw an error. If an error is
thrown, the connection will be rejected. Client metadata is available via
`client.meta` after the validation (which means it's not available in
validation)

## Combining
Lastly, combine everything together to create a synchronizer.

You don't need to specify the options in the client, as server sends the
options on connection.

### Server
```js
import { HostSynchronizer } from 'locksmith';

let machine = new Machine();
let connector = new Connector();

let synchronizer = new HostSynchronizer(machine, connector, {
  dynamic: false,
  dynamicPushWait: 10,
  dynamicTickWait: 10,
  fixedTick: 50,
  fixedBuffer: 1,
  disconnectWait: 10000,
  freezeWait: 1000
});
connector.synchronizer = synchronizer;

synchronizer.start();
```

### Client
```js
import { Synchronizer } from 'locksmith';

let machine = new Machine();
let connector = new Connector();

let synchronizer = new Synchronizer(machine, connector);
connector.synchronizer = synchronizer;

connector.connect();
```

### Pushing actions
```js
let action = {}; // It can be anything
synchronizer.push(action);
```

### Sending connect action
Host (Server) can register a event listener to spawn a connect event.
```js
synchronizer.on('connect', clientId => {
  synchronizer.push({
    type: 'connect',
    id: clientId
    // etc...
  });
});
```

Same for disconnect, etc.

# Events
- start() - Synchronizer has started.
- stop() - Synchronizer has stopped.
- tick(tickId) - Tick has occurred.
- freeze(clientId) - Synchronizer freezed. `clientId` is only available on host.
- unfreeze(clientId) - Synchronizer unfreezed. `clientId` is only available on
  host.
- connect(clientId) - A client has connected. `clientId` is only available on
  host.
- disconnect(clientId) - A client has disconnected. `clientId` is only available
  on host.
- error(error, clientId) - An error has occurred. `clientId` is only available
  on host. **You must listen to this event to prevent terminating node process!**

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
