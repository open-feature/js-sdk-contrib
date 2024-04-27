import { useState } from 'react';
import { Arg } from '../../src';
import './App.css';

function App() {
  const [payload, setPayload] = useState<string>();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '80vw' }}>
      <Arg
        onChange={function (payload): void {
          setPayload(JSON.stringify(payload, undefined, 2));
        }}
      ></Arg>
      <textarea cols={30} rows={30} style={{ maxWidth: '50%', margin: '5%' }} value={payload}></textarea>
    </div>
  );
}

export default App;
