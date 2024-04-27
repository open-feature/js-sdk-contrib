import React, { useState } from 'react';
import { Rule } from './Rule';
import { AnyOperand, Operation } from '../constants';

interface ArgProps {
  tip?: string;
  children?: React.ReactNode;
  onChange: (payload: Operation | AnyOperand) => void;
}

export function Arg(props: ArgProps) {
  const [isSet, set] = useState<boolean | undefined>(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid white' }}>
      {props.tip ? <div style={{ margin: '0 .5em 0 1em', fontWeight: 'lighter' }}>{props.tip}</div> : <></>}
      <div>
        {isSet === true ? (
          <div style={{ display: 'flex' }}>
            <Rule
              onChange={(payload) => {
                props.onChange(payload);
              }}
            ></Rule>
            <button
              onClick={() => {
                props.onChange({});
                set(false);
              }}
            >
              ✖️
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                set(true);
                props.onChange({});
              }}
            >
              ➕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
