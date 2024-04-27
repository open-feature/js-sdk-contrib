import React, { useEffect, useState } from 'react';
import { Arg, Op, UnaryOps } from '../constants';
import { Argument } from './Argument';
import { getArgs, getKey } from './util';

interface RuleProps {
  initialKey: string;
  label: string;
  value: Op;
  onChange: (value: Op) => void;
}

export function UnaryRule(props: RuleProps) {
  const [op, setOp] = useState<string>(getKey(props.value) || props.initialKey); // default this better
  const [args, setArgs] = useState<Arg[]>(getArgs(props.value) || [{}]);

  useEffect(() => {
    props.onChange({ [op]: args });
  }, []);

  useEffect(() => {
    setArgs(getArgs(props.value));
    setOp(getKey(props.value)); // default??
  }, [props.value]);

  return (
    <div style={{ display: 'flex' }}>
      <Argument
        value={args?.[0]}
        onChange={(value) => {
          const newArgs = [value];
          setArgs(newArgs);
          props.onChange({ [op]: newArgs });
        }}
      ></Argument>
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
        {UnaryOps.map((o) => (
          <option key={o} id={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
