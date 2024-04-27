import React, { useEffect, useState } from 'react';
import { Arg, DefaultVariadicArg, Op, VariadicOps } from '../constants';
import { Argument } from './Argument';
import { getArgs, getKey } from './util';

interface Props {
  label: string;
  initialKey: string;
  value: Op;
  onChange: (value: Op) => void;
}

export function VariadicRule(props: Props) {
  const [op, setOp] = useState<string>(getKey(props.value) || props.initialKey);
  const [args, setArgs] = useState<Arg[]>(getArgs(props.value) || [DefaultVariadicArg]);

  useEffect(() => {
    props.onChange({ [op]: args });
  }, []);

  useEffect(() => {
    setArgs(
      getArgs(props.value) || [
        {
          '===': [
            {
              var: '',
            },
            [],
          ],
        },
      ],
    );
    setOp(getKey(props.value)); // default??
  }, [props.value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div>
        {args?.map((_, index) => {
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ minWidth: '50px' }}>
                {index === args.length - 1 ? (
                  <select
                    value={op}
                    onChange={(e) => {
                      setOp(e.target.value);
                      props.onChange({ [e.target.value]: args });
                    }}
                    name="op"
                    id="op"
                  >
                    {props.label}
                    {VariadicOps.map((o) => (
                      <option key={o} id={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <></>
                )}
              </div>
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Argument
                  value={args[index]}
                  onChange={(payload) => {
                    const newArgs = args;
                    newArgs[index] = payload;
                    setArgs([...newArgs]);
                    props.onChange({ [op]: args });
                  }}
                ></Argument>
                {index === 0 ? (
                  <></>
                ) : (
                  <button
                    onClick={() => {
                      args.splice(index, 1);
                      setArgs([...args]);
                      props.onChange({ [op]: args });
                    }}
                  >
                    ✖️
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          onClick={() => {
            const newArgs = [...args, DefaultVariadicArg];
            setArgs(newArgs);
            props.onChange({ [op]: newArgs });
          }}
        >
          ➕
        </button>
      </div>
    </div>
  );
}
