import { useState } from 'react';
import { Builder } from '../../src';
import './App.css';
import { Attribute } from '../../src/lib/types';
import { IntlProvider } from 'react-intl';
import { Button } from '@dynatrace/strato-components/buttons';
import { Container } from '@dynatrace/strato-components/layouts';
import { PlusIcon } from '@dynatrace/strato-icons';

export const SINGLE_IF_RULE = {
  if: [
    {
      '!=': [
        {
          var: ['tenant'],
        },
        'def12345',
      ],
    },
    'off',
  ],
};

export const FRACTIONAL_RULE = {
  fractional: [
    [
      "red",
      25
    ],
    [
      "blue",
      25
    ],
    [
      "green",
      25
    ],
    [
      "grey",
      25
    ]
  ]
};

export const BIG_RULE = {
  if: [
    {
      and: [
        {
          '==': [
            {
              var: ['tenant'],
            },
            'abc12345',
          ],
        },
        {
          '!=': [
            {
              var: ['tenant'],
            },
            'def12345',
          ],
        },
        {
          and: [
            {
              '==': [
                {
                  var: ['tenant'],
                },
                'abc12345',
              ],
            },
            {
              '!=': [
                {
                  var: ['tenant'],
                },
                'def12345',
              ],
            },
            {
              sem_ver: [
                {
                  var: ['version'],
                },
                '^',
                '3.0.0',
              ],
            },
          ],
        },
      ],
    },
    'off',
  ],
};

function App() {
  const [value, setValue] = useState<string>('{"if":[]}');
  const variants = ['on', 'off'];
  const attributes: Attribute[] = [
    { key: 'tenant', type: 'string' },
    { key: 'version', type: 'version' },
    { key: 'email', type: 'string' },
    { key: 'region', type: 'string' },
  ];

  return (
    <IntlProvider locale="en">

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80vw', flexWrap: 'wrap' }}>
        <Builder
          attributes={attributes}
          value={value}
          onChange={(value) => {
            setValue(value);
          }}
          variants={variants}
        />
        <textarea
          cols={30}
          rows={30}
          style={{ maxWidth: '50%', margin: '5%' }}
          value={value}
          onChange={(e) => {
            try {
              const value = e.target.value;
              setValue(value);
            } catch (err) {
              setValue('{}');
            }
          }}
        ></textarea>
      </div>
      <Container style={{ display:'flex', justifyContent: 'space-evenly', marginBottom: '10px', bottom: 0, width: '100%' }}>
        <Button
          onClick={() => {
            setValue(JSON.stringify(BIG_RULE, undefined, 2));
          }}
        >
          <PlusIcon/>Big Demo Rule
        </Button>
        <Button
          onClick={() => {
            setValue(JSON.stringify(SINGLE_IF_RULE, undefined, 2));
          }}
        >
          <PlusIcon/>Single If Demo Rule
        </Button>
        <Button
          onClick={() => {
            setValue(JSON.stringify(FRACTIONAL_RULE, undefined, 2));
          }}
        >
          <PlusIcon/>Fractional Demo Rule
        </Button>
      </Container>
    </IntlProvider>
  );
}

export default App;
