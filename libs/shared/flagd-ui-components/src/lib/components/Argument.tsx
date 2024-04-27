import React, { useEffect, useState } from 'react';
import {
  AllTokens,
  Arg,
  ArrayToken,
  BinaryOps,
  Op,
  OpTokens,
  Primitive,
  PrimitiveTokens,
  Token,
  UnaryOps,
  VarToken,
  VariadicOps,
} from '../constants';
import { BinaryRule } from './BinaryRule';
import { VariadicRule } from './VariadicRule';
import { IfRule } from './IfRule';
import { UnaryRule } from './UnaryRule';
import { Attribute, useAttributes } from './context';
import { getArgs, getFirstArg, getKey } from './util';

interface ArgProps {
  children?: React.ReactNode;
  value: Op | Arg;
  onChange: (value: Op | Arg) => void;
}

export function Argument(props: ArgProps) {
  const [adding, setAdding] = useState<boolean | undefined>(false);
  const [token, setToken] = useState<Token | undefined>();
  const attributes = useAttributes();

  useEffect(() => {
    const token =
      typeof props.value === 'object'
        ? Array.isArray(props.value)
          ? ArrayToken
          : AllTokens.find((t) => t.id === getKey(props.value as Op))
        : PrimitiveTokens.find((t) => t.id === typeof props.value);
    setToken(token);
    console.log('token:');
    console.log(token);
  }, [props.value]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid white' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid white' }}
      >
        {token ? (
          <>
            {BinaryOps.includes(token.id) ? (
              <BinaryRule
                initialKey={token.id}
                value={props.value as Op}
                label={token.label}
                onChange={(value) => props.onChange(value)}
              ></BinaryRule>
            ) : VariadicOps.includes(token.id) ? (
              <VariadicRule
                initialKey={token.id}
                value={props.value as Op}
                onChange={(value) => props.onChange(value)}
                label={token.label}
              ></VariadicRule>
            ) : UnaryOps.includes(token.id) ? (
              <UnaryRule
                initialKey={token.id}
                value={props.value as Op}
                onChange={(value) => props.onChange(value)}
                label={token.label}
              ></UnaryRule>
            ) : token.id === 'if' ? (
              <IfRule value={props.value as Op} onChange={(value) => props.onChange(value)}></IfRule>
            ) : token.id === 'var' ? (
              <VarSelector
                value={props.value as Op}
                onChange={(value) => {
                  props.onChange(value);
                }}
                attributes={attributes}
              />
            ) : token.id === 'array' ? (
              <ArrayInput
                value={props.value as Array<Primitive>}
                onChange={(value) => props.onChange(value)}
              ></ArrayInput>
            ) : token.id === 'number' ? (
              <NumberInput
                value={props.value as number}
                onChange={(value) => {
                  props.onChange(value);
                }}
              />
            ) : token.id === 'string' ? (
              <StringInput
                value={props.value as string}
                onChange={(value) => {
                  props.onChange(value);
                }}
              />
            ) : token.id === 'boolean' ? (
              <BooleanInput
                checked={!!props.value}
                onChange={(value) => {
                  props.onChange(value);
                }}
              />
            ) : (
              <>NOT HANDLED</>
            )}
            <button
              onClick={() => {
                props.onChange({});
                setAdding(false);
                setToken(undefined);
              }}
            >
              ✖️
            </button>
          </>
        ) : (
          <>
            {adding === true ? (
              <div style={{ display: 'flex' }}>
                <select
                  defaultValue={'DEFAULT'}
                  onChange={(e) => {
                    setToken(AllTokens.find((t) => t.id === e.target.value));
                    console.log(`token: ${e.target.value}`);
                  }}
                >
                  <option key="DEFAULT" value={'DEFAULT'} disabled>
                    Please select...
                  </option>
                  <option key="OPERATIONS" value={'OPERATIONS'} disabled>
                    Operations
                  </option>
                  {Object.values(OpTokens).map((token) => (
                    <option key={token.id} id={token.id} value={token.id}>
                      {token.label}
                    </option>
                  ))}
                  <option key="CONTEXT" value={'CONTEXT'} disabled>
                    Context
                  </option>
                  <option key={VarToken.id} id={VarToken.id} value={VarToken.id}>
                    {VarToken.label}
                  </option>
                  <option key="PRIMITIVE" value={'PRIMITIVE'} disabled>
                    Primitives
                  </option>
                  {Object.values(PrimitiveTokens).map((token) => (
                    <option key={token.id} id={token.id} value={token.id}>
                      {token.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    props.onChange({});
                    setAdding(false);
                  }}
                >
                  ✖️
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAdding(true);
                    props.onChange({});
                  }}
                >
                  ➕
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// TODO: all these could be separate files
interface BooleanInputProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

function BooleanInput(props: BooleanInputProps) {
  useEffect(() => {
    props.onChange(props.checked);
  }, []);

  return (
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(e) => {
        props.onChange(e.target.checked);
      }}
    ></input>
  );
}

interface ArrayInputProps {
  value: Array<Primitive>;
  onChange: (value: Array<Primitive>) => void;
}

function ArrayInput(props: ArrayInputProps) {
  const value = Array.isArray(props.value) ? props.value : [];

  useEffect(() => {
    props.onChange(value);
  }, []);

  return (
    <input
      style={{ maxWidth: '200px' }}
      type="text"
      value={value.join(', ')}
      onChange={(e) => {
        props.onChange(e.target.value.split(',').map((v) => v.trim()));
      }}
    ></input>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
}

function NumberInput(props: NumberInputProps) {
  const value = typeof props.value === 'number' ? props.value : 0;

  useEffect(() => {
    props.onChange(value);
  }, []);

  return (
    <input
      style={{ maxWidth: '50px' }}
      type="number"
      value={value}
      onChange={(e) => {
        if (e.target.value === '') return; // abort if empty, or things get weird
        props.onChange(
          Number.isNaN(e.target.value)
            ? 0
            : Number.isInteger(e.target.value)
              ? Number.parseInt(e.target.value)
              : Number.parseFloat(e.target.value),
        );
      }}
    ></input>
  );
}

interface StringInputProps {
  value: string;
  onChange: (value: string) => void;
}

function StringInput(props: StringInputProps) {
  const value = typeof props.value === 'string' ? props.value : '';

  useEffect(() => {
    props.onChange(value);
  }, []);

  return (
    <input
      style={{ maxWidth: '80px' }}
      type="text"
      value={value}
      onChange={(e) => {
        props.onChange(e.target.value);
      }}
    ></input>
  );
}

interface VarSelectorProps {
  value: Op;
  attributes: Attribute[];
  onChange: (value: Op) => void;
}

function VarSelector(props: VarSelectorProps) {
  useEffect(() => {
    props.onChange(props.value);
  }, []);

  return (
    <select
      // support var shothand (getArgs cant return a string)
      value={getArgs(props.value || '') || getFirstArg(props.value)}
      onChange={(e) => props.onChange({ var: [e.target.value] })}
    >
      <option key="DEFAULT" value={'DEFAULT'} disabled>
        Please select...
      </option>
      {props.attributes.map((attr) => {
        return (
          <option key={attr.key} id={attr.key}>
            {attr.key}
          </option>
        );
      })}
    </select>
  );
}

interface VaraintSelectorProps {
  value: Op;
  variants: string[];
  onChange: (value: Op) => void;
}

function VaraintSelector(props: VaraintSelectorProps) {
  useEffect(() => {
    props.onChange(props.value);
  }, []);

  return (
    <select
      // support var shorthand (getArgs cant return a string)
      value={getArgs(props.value) || getFirstArg(props.value)}
      onChange={(e) => props.onChange({ var: [e.target.value] })}
    >
      <option key="DEFAULT" value={'DEFAULT'} disabled>
        Please select...
      </option>
      {props.variants.map((variant) => {
        return (
          <option key={variant} id={variant}>
            {variant}
          </option>
        );
      })}
    </select>
  );
}
