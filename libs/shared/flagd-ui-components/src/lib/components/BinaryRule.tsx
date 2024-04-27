import React, { useEffect, useState } from 'react';
import { BinaryOps, Op } from '../constants';
import { Argument } from './Argument';
import { getKey, getArgs } from './util';

interface RuleProps {
  label: string;
  initialKey: string;
  value: Op;
  onChange: (value: Op) => void;
}

export function BinaryRule(props: RuleProps) {
  const [op, setOp] = useState<string>(getKey(props.value) || props.initialKey); // default this better
  const [args, setArgs] = useState<any[]>(getArgs(props.value) || [{}, {}]);

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
          const newArgs = [value, args?.[1]];
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
        {BinaryOps.map((o) => (
          <option key={o} id={o}>
            {o}
          </option>
        ))}
      </select>
      <Argument
        value={args?.[1]}
        onChange={(value) => {
          const newArgs = [args?.[0], value];
          setArgs(newArgs);
          props.onChange({ [op]: newArgs });
        }}
      ></Argument>
    </div>
  );
}
