import React, { useEffect, useState } from 'react';
import { Arg, If, Op } from '../constants';
import { Argument } from './Argument';
import { isPrimitive } from './util';

interface RuleProps {
  value: Op;
  onChange: (value: { if: Arg[] }) => void;
}

export function IfRule(props: RuleProps) {
  const [args, setArgs] = useState<Arg[]>([]);

  useEffect(() => {
    setArgs(props.value[If] || [{ '===': [{}, {}] }]);
  }, [props.value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div>
        {args?.map((arg, index) => {
          return (
            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ padding: '10px' }}>{index === 0 ? <>If</> : isPrimitive(arg) ? <>Then</> : <>Else</>}</div>

              <Argument
                value={args[index]}
                onChange={(payload) => {
                  const newArgs = args;
                  newArgs[index] = payload;
                  setArgs([...newArgs]);
                  props.onChange({ if: args });
                }}
              ></Argument>
              {index === 0 ? (
                <></>
              ) : (
                <button
                  onClick={() => {
                    args.splice(index, 1);
                    setArgs([...args]);
                    props.onChange({ if: args });
                  }}
                >
                  ✖️
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => {
            const newArgs = [...args, {}];
            setArgs(newArgs);
            props.onChange({ if: newArgs });
          }}
        >
          ➕
        </button>
      </div>
    </div>
  );
}
