import React, { useState } from 'react';

// ********************************************************************************
export const App = () => {
  const [count, setCount] = useState(0/*start at zero*/);

  return (
    <div className="app">
      <h1>Hello from CharmIQ!</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};
