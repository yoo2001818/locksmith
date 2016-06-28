// A simple replica of Redux for testing.

export default class ReducerMachine {
  constructor(reducer, state) {
    this.reducer = reducer;
    this.state = state;
    // Doing this to get initial state
    this.run();
  }
  getState() {
    return this.state;
  }
  loadState(state) {
    this.state = state;
  }
  run(action) {
    this.state = this.reducer(this.state, action);
    console.log('State: ', this.state);
  }
}
