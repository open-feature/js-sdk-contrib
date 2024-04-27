import React, { useState } from 'react';
import { Argument } from './Argument';
import { Attribute, BuilderContext } from './context';
import { DefaultRule } from '../constants';

interface Props {
  attributes: Attribute[];
  variants: (string | number | boolean)[];
  value: string;
  onChange: (value: string) => void;
}

export function Builder(props: Props) {
  const value = props.value || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    // TODO: log
  }

  return (
    <BuilderContext.Provider value={{ attributes: props.attributes, variants: props.variants }}>
      {value === '{}' ? (
        <button
          onClick={() => {
            props.onChange(JSON.stringify(DefaultRule));
          }}
        >
          Add rule
        </button>
      ) : (
        <></>
      )}
      <Argument
        value={parsed}
        onChange={function (value): void {
          props.onChange(JSON.stringify(value));
        }}
      ></Argument>
    </BuilderContext.Provider>
  );
}
