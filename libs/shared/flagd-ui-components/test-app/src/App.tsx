import { useState } from 'react';
import { Builder } from '../../src';
import './App.css';
import { Attribute } from '../../src/lib/components/context';

function App() {
  const [value, setValue] = useState<string>('{}');
  const variants = ['on', 'off'];
  const attributes: Attribute[] = [
    {key: 'email', type: 'string'},
    {key: 'admin', type: 'boolean'}
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80vw', flexWrap: 'wrap' }}>
      <Builder attributes={attributes} value={value} onChange={(value) => {
        setValue(JSON.stringify(JSON.parse(value), undefined, 2));
      } } variants={variants} />
      <textarea cols={30} rows={30} style={{ maxWidth: '50%', margin: '5%' }} value={value} onChange={(e) => {
        try {
          const value = e.target.value;
          setValue(value);
        } catch (err) {
          setValue('{}');
        }
      }}></textarea>
    </div>
  );
}

export default App;
