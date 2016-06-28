function operand(calc, state) {
  if (state.length < 2) return [];
  return state.slice(0, -2).concat(
    [calc(state[state.length - 1], state[state.length - 2])]
  );
}

export default function calculator(state = [], action) {
  // This is just a simple stack based calculator, used for testing.
  switch (action) {
  case '+': return operand((a, b) => (a + b), state, action);
  case '-': return operand((a, b) => (a - b), state, action);
  case '/': return operand((a, b) => (a / b), state, action);
  case '*': return operand((a, b) => (a * b), state, action);
  case '%': return operand((a, b) => (a % b), state, action);
  }
  if (typeof action === 'number') {
    return state.concat([action]);
  }
  return state;
}
